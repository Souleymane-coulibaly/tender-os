import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, BillingAuditLogEntry } from "../application/ports/audit-log-writer";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.2 — correctif d'un P0 découvert en construisant la preuve
 * d'intégration réelle mandatée par la mission (§9, flux Trial local) : `AuditLog.actor_id` est
 * `@db.Uuid` en base, mais `HandleStripeWebhookUseCase` (Sprint 22C) écrit systématiquement
 * `actorId: "stripe-webhook"` (chaîne littérale, jamais un UUID) pour TOUT événement webhook —
 * `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`,
 * `invoice.payment_failed` — de même que le nouveau worker de rattrapage mensuel (Checkpoint E1.1/
 * E1.2, `actorId: "system-monthly-grant-worker"`). Contre de VRAIS fakes en mémoire (tous les tests
 * unitaires existants avant ce Checkpoint), rien ne détecte ce défaut — seule une preuve contre
 * PostgreSQL réel le révèle : Postgres rejette l'écriture avec une erreur de conversion UUID, la
 * transaction webhook échoue entièrement, `HandleStripeWebhookUseCase` la relance (`markFailed` +
 * `throw`), Stripe reçoit un non-2xx et rejoue l'événement indéfiniment — un abonnement/Trial/crédit
 * webhook-déclenché ne s'appliquerait donc JAMAIS contre une base au schéma réel.
 *
 * Corrigé ICI, à la frontière infrastructure UNIQUEMENT (aucun changement de schéma, aucune commande
 * de use case modifiée) — même motif déjà établi ailleurs dans le dépôt pour distinguer un acteur
 * SYSTEM d'un acteur USER (voir `actorType: "SYSTEM"` dans `analysis/.../process-analysis-job.use-case.ts`
 * et les modules `generation`/`extraction`/`knowledge-base`/`ai-benchmark`, qui omettent simplement
 * `actorId` pour ces actions) : un `actorId` qui n'est PAS un UUID valide est un acteur SYSTEM, jamais
 * écrit dans la colonne UUID (`null` à la place, la chaîne d'origine préservée dans `metadata` pour
 * rester traçable) — comportement STRICTEMENT INCHANGÉ pour tout acteur UTILISATEUR réel (UUID valide).
 */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: BillingAuditLogEntry): Promise<void> {
    const isRealUserActor = UUID_PATTERN.test(entry.actorId);
    await this.prisma.currentClient().auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorType: isRealUserActor ? "USER" : "SYSTEM",
        actorId: isRealUserActor ? entry.actorId : null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        result: "SUCCESS",
        metadata: (isRealUserActor ? (entry.metadata ?? {}) : { ...(entry.metadata ?? {}), systemActor: entry.actorId }) as Prisma.InputJsonValue,
      },
    });
  }
}
