import { Inject, Injectable } from "@nestjs/common";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { getPlanQuotaLimit } from "../../domain/plan-catalog";
import { QuotaType, UNLIMITED } from "../../domain/quota-type";
import { InsufficientAoCreditsError } from "../../domain/errors";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";
import { ConsumePassForTenderUseCase } from "./consume-pass-for-tender.use-case";

/** Mission §53 "2 crédits restants / 1 crédit restant / 0 crédit" — jamais un spam à chaque
 *  consommation : la consommation décrémente TOUJOURS le solde d'exactement 1 (mission §17, jamais
 *  un montant variable), donc chaque palier n'est atteint qu'UNE SEULE fois par descente
 *  monotone — inutile de mémoriser un "dernier seuil notifié" pour éviter la répétition. Si le
 *  solde remonte (grant) puis redescend, une nouvelle notification est légitime, pas un doublon. */
const LOW_BALANCE_THRESHOLDS = new Set([2, 1, 0]);

export type ConsumeAoCreditCommand = Readonly<{ organizationId: string; tenderId: string; actorId: string; occurredAt: Date }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 — relocalisé depuis `CreateTenderUseCase.execute()`
 * (mission "1 Tender traité = maximum 1 crédit AO", jamais à la création) vers le premier
 * `TenderSubmission` réellement enregistré (`RecordTenderSubmissionUseCase`, les deux branches
 * "création directe" et "finalisation depuis SUBMISSION_IN_PROGRESS"). Le mécanisme lui-même reste
 * inchangé (compare-and-set/Pass, ci-dessous) — seul le POINT D'APPEL a changé, jamais dupliqué à un
 * second endroit.
 *
 * Deux mécanismes de crédit distincts (mission §17/§20, jamais unifiés artificiellement), avec une
 * PRÉCÉDENCE explicite depuis le Checkpoint E1.3 (mission §6 "PASS + SUBSCRIPTION") :
 *   1. un Pass déjà RESERVED ou CONSUMED pour CE Tender existe (Checkpoint P2.3-E1.2, "1 Pass AO =
 *      1 Tender / 1 AO") -> il reste TOUJOURS la source de consommation, même si l'organisation a
 *      souscrit un abonnement DEPUIS la réservation (mission — jamais un Pass réservé qui reste
 *      bloqué indéfiniment, jamais une double consommation Pass+abonnement) ;
 *   2. sinon, abonnement actif à quota FINI (Starter/Business) -> ledger AO (compare-and-set,
 *      mission §16) ;
 *   3. sinon, abonnement actif ILLIMITÉ (Enterprise, mission §14) -> jamais bloqué, jamais de ledger ;
 *   4. sinon -> refus (mission — aucun palier gratuit n'existe dans le catalogue, voir
 *      plan-catalog.ts).
 */
@Injectable()
export class ConsumeAoCreditUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly consumePassForTenderUseCase: ConsumePassForTenderUseCase,
  ) {}

  async execute(command: ConsumeAoCreditCommand): Promise<void> {
    // Checkpoint P2.3-E1.1, FINDING 4 (AO CREDIT IDEMPOTENCE) — garde UNIFIÉE, avant toute
    // branche : `RecordTenderSubmissionUseCase` appelle ce use case à CHAQUE dépôt réussi pour un
    // Tender (premier dépôt, mais aussi une resoumission après retrait — jamais seulement "le
    // premier appel" au sens applicatif). Le plan de l'organisation peut avoir changé ENTRE la
    // consommation d'origine et cet appel (ex. consommé via Pass, puis organisation abonnée Starter
    // depuis) : sans cette garde, la branche abonnement ci-dessous ne trouverait aucune ligne
    // CONSUMPTION dans SON propre ledger et déciderait, à tort, de décrémenter un second crédit pour
    // ce même Tender. Couvre les deux mécanismes (ledger ET Pass) en une seule vérification,
    // indépendante du chemin emprunté la première fois.
    const alreadyConsumedViaLedger = await this.ledgerRepository.findConsumptionByTenderId(command.organizationId, command.tenderId);
    if (alreadyConsumedViaLedger) {
      return;
    }
    const alreadyConsumedViaPass = await this.passPurchaseRepository.findByTenderId(command.organizationId, command.tenderId);
    if (alreadyConsumedViaPass && alreadyConsumedViaPass.consumedTenderId === command.tenderId) {
      return;
    }

    // Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §6 (PASS + SUBSCRIPTION) — correctif du finding
    // Codex : la provenance commerciale d'un Tender se fige à la RÉSERVATION du Pass (E1.2), jamais
    // à l'état COURANT de l'abonnement au moment du dépôt. Si un Pass est déjà RESERVED ou CONSUMED
    // pour CE Tender, il reste la source de consommation MÊME SI l'organisation a souscrit un
    // abonnement DEPUIS (scénario "RESERVED(A) puis Starter/Business puis dépôt de A") — vérifié EN
    // PREMIER, avant la branche abonnement, pour ne jamais laisser ce Pass bloqué indéfiniment en
    // RESERVED (aucune consommation ne le ferait plus jamais transiter vers CONSUMED) tout en évitant
    // de brûler simultanément un crédit d'abonnement pour le même dépôt (mission "aucune double
    // consommation").
    const assignedPass = await this.passPurchaseRepository.findAssignedToTender(command.organizationId, command.tenderId);
    if (assignedPass) {
      await this.consumePassForTenderUseCase.execute({
        organizationId: command.organizationId,
        passPurchaseId: assignedPass.id,
        tenderId: command.tenderId,
        actorId: command.actorId,
        occurredAt: command.occurredAt,
      });
      return;
    }

    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);

    // V2 Sprint 25 (Trial Starter) — `isEntitled` (ACTIVE ou TRIALING) : un Trial doit pouvoir
    // consommer son crédit d'essai via ce même chemin, jamais retomber sur la branche Pass.
    if (subscription && subscription.isEntitled) {
      const monthlyGrantLimit = getPlanQuotaLimit(subscription.planTier, QuotaType.AoMonthlyGrant);
      if (monthlyGrantLimit === UNLIMITED) {
        // Mission §14 — fair-use illimité (Enterprise) : jamais de ledger numérique, jamais bloqué.
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "AoCreditsConsumed",
          resourceType: "Tender",
          resourceId: command.tenderId,
          metadata: { unlimited: true },
        });
        return;
      }

      const { applied, entry } = await this.ledgerRepository.consume({ organizationId: command.organizationId, tenderId: command.tenderId, amount: 1, occurredAt: command.occurredAt });
      if (!applied) {
        throw new InsufficientAoCreditsError(command.organizationId);
      }

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "AoCreditsConsumed",
        resourceType: "AoCreditLedgerEntry",
        resourceId: entry!.id,
        metadata: { tenderId: command.tenderId, balanceAfter: entry!.balanceAfter },
      });

      if (LOW_BALANCE_THRESHOLDS.has(entry!.balanceAfter)) {
        await this.outboxWriter.write({
          organizationId: command.organizationId,
          events: [
            {
              eventType: "AoCreditBalanceLow",
              aggregateType: "AoCreditLedgerEntry",
              aggregateId: entry!.id,
              payload: { balance: entry!.balanceAfter },
              occurredAt: command.occurredAt,
            },
          ],
        });
      }
      return;
    }

    // Ni Pass affecté à ce Tender, ni abonnement actif/essai — ne devrait normalement jamais
    // survenir (le gate FINDING 1/E1.3 `runTenderOperationEntitled` réserve ou vérifie déjà
    // l'entitlement avant tout accès cœur AO) mais reste géré sans deviner : refus explicite, jamais
    // une sélection de repli.
    throw new InsufficientAoCreditsError(command.organizationId);
  }
}
