import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { ReleasePassForTenderUseCase } from "../../../billing";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderPermission } from "../../domain/tender-permission";
import { TenderStatus } from "../../domain/tender-status";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { TENDER_STATUS_HISTORY_REPOSITORY, type TenderStatusHistoryRepository } from "../ports/tender-status-history.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type AbandonTenderCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type AbandonTenderResult = Readonly<{ tender: TenderSummary; passReleaseOutcome: "NO_PASS_ASSIGNED" | "ALREADY_CONSUMED" | "RELEASED" | "NOT_RELEASED" }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §7/§8/§9 — DÉCISION PRODUIT : "un utilisateur ayant
 * payé un Pass AO ne doit pas perdre définitivement son Pass simplement parce qu'il abandonne un AO
 * avant le dépôt", via une action EXPLICITE et VOLONTAIRE ("Abandonner l'appel d'offres"), JAMAIS un
 * déclenchement automatique (mission — un simple NO_GO ou une modification métier ambiguë ne libère
 * rien, voir E1.3 `PASS_ABANDONMENT_BEHAVIOR`).
 *
 * Audité AVANT toute implémentation (mission §8 "auditer s'il existe déjà une vraie action") :
 * `ArchiveTenderUseCase`/`TenderStatus.Archived` est la seule action existante sémantiquement
 * proche, mais RÉUTILISER littéralement la MÊME transition pour cette nouvelle sémantique aurait
 * cassé l'idempotence exigée (mission §9.7) — `changeStatus(Archived, ...)` lève
 * `InvalidTenderStatusTransitionError` sur un Tender DÉJÀ Archived (aucune transition
 * `Archived -> Archived` dans `ALLOWED_TENDER_TRANSITIONS`), alors qu'un second appel d'abandon (ex.
 * double-clic, retry réseau) doit rester un no-op sûr. Design retenu : réutilise l'infrastructure
 * ÉPROUVÉE d'Archive (même permission, même `assertTenderMutationAllowed`, même historique de
 * statut) pour la partie Tender — mais la transition de statut est appliquée SEULEMENT si le Tender
 * n'est pas déjà Archived (idempotent par construction) — TANDIS QUE la libération du Pass est
 * TOUJOURS tentée, indépendamment du statut, via `ReleasePassForTenderUseCase.releaseForTenderIfReserved`
 * (mission §8 "réutiliser ReleasePassForTenderUseCase, ne pas créer un second moteur"). Un Tender
 * déjà Won/Lost/Submitted archivé légitimement (Pass déjà CONSUMED depuis longtemps) reste un no-op
 * sûr sur la partie Pass — jamais un remboursement, structurellement impossible (mission §9/§12).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §4/§7 (ATOMICITÉ ABANDON) — correctif du finding Codex
 * E1.4 : archive Tender + release Pass n'étaient pas atomiques (deux écritures indépendantes, aucun
 * rollback partagé). Audit AVANT correctif (mission §1.A) : le mécanisme requis EXISTE déjà et n'a
 * jamais eu besoin d'être inventé — `AtomicTransactionRunner` (même port que `CreateTenderUseCase`
 * dans CE module) ouvre une transaction Postgres via `TransactionalContext` (AsyncLocalStorage) ;
 * TOUT repository qui lit via `PrismaService.currentClient()` (au lieu de `this.prisma` brut) la
 * rejoint AUTOMATIQUEMENT, quel que soit son module — `PrismaTenderRepository.save`,
 * `PrismaPassPurchaseRepository.releaseReservation` (via `ReleasePassForTenderUseCase`),
 * `PrismaAuditLogWriter.record` (tenders ET billing) et `PrismaOutboxEventRepository.insertMany`
 * l'utilisaient déjà tous. Seul `PrismaTenderStatusHistoryRepository` ne le faisait pas (corrigé dans
 * ce même Checkpoint) — sans ce correctif, l'historique de statut serait resté écrit hors
 * transaction, un état partiel durable resterait possible malgré le `run()` ci-dessous. Aucun second
 * moteur, aucun SQL ad hoc : la transaction unique enveloppe exactement la même séquence
 * qu'auparavant, jamais un raccourci ni une compensation inventée (mission §4 "INTERDIT").
 */
@Injectable()
export class AbandonTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_STATUS_HISTORY_REPOSITORY) private readonly statusHistoryRepository: TenderStatusHistoryRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly releasePassForTenderUseCase: ReleasePassForTenderUseCase,
  ) {}

  async execute(command: AbandonTenderCommand): Promise<AbandonTenderResult> {
    // Mission §9.1/§9.2/§9.3 — tenant + permissions + identification exacte du Tender, même point
    // d'application UNIQUE que le reste du module (jamais une seconde vérification divergente).
    // Volontairement HORS transaction (lecture seule, même motif que la readiness de
    // `RecordTenderSubmissionUseCase` : seule la mutation réelle a besoin d'atomicité).
    assertHasTenderPermission(command.actorRole, TenderPermission.Archive);
    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const occurredAt = this.clock.now();

    // Mission §4/§7 — archive + release + audit + outbox forment désormais UNE SEULE opération
    // cohérente (une transaction Postgres, un seul COMMIT). Si la release échoue avec une erreur
    // réelle (jamais le cas nominal `applied:false`, qui reste un résultat métier valide — voir
    // `ReleasePassForTenderUseCase`), ou si toute autre étape lève, la transition de statut ET
    // l'historique déjà écrits dans CETTE transaction sont annulés intégralement — aucun état partiel
    // durable (mission §7 CAS A/CAS B).
    const release = await this.atomicTransactionRunner.run(async () => {
      // Mission §9.4/§9.7 — vérifie l'état AVANT de muter : idempotent par construction (un second
      // abandon sur un Tender déjà Archived ne relève jamais `InvalidTenderStatusTransitionError`,
      // saute simplement la transition déjà accomplie).
      if (tender.status !== TenderStatus.Archived) {
        const previousStatus = tender.status;
        tender.changeStatus(TenderStatus.Archived, occurredAt);
        await this.tenderRepository.save(tender);
        await this.statusHistoryRepository.append({
          organizationId: command.organizationId,
          tenderId: command.tenderId,
          previousStatus,
          newStatus: TenderStatus.Archived,
          reason: command.reason,
          changedBy: command.actorId,
          occurredAt,
        });
      }

      // Mission §9.5/§9.6/§10/§11/§12 — libère UNIQUEMENT un Pass RESERVED pour CE Tender précis,
      // jamais un Pass CONSUMED (remboursement interdit), jamais un autre Tender. No-op sûr si
      // l'organisation est couverte par abonnement (mission §10 "aucun crédit mensuel remboursé").
      const releaseOutcome = await this.releasePassForTenderUseCase.releaseForTenderIfReserved({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        occurredAt,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "tender.abandoned",
        resourceType: "tender",
        resourceId: tender.id.value,
        requestId: command.requestId,
        metadata: { passReleaseOutcome: releaseOutcome.outcome },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TenderAbandoned",
            aggregateType: "Tender",
            aggregateId: tender.id.value,
            payload: { tenderId: tender.id.value, passReleaseOutcome: releaseOutcome.outcome },
            occurredAt,
          },
        ],
      });

      return releaseOutcome;
    });

    return { tender: toTenderSummary(tender), passReleaseOutcome: release.outcome };
  }
}
