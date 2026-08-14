import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { PASS_EXPIRATION_POLICY_DAYS, PLAN_CATALOG } from "../../domain/plan-catalog";
import { PlanTier } from "../../domain/plan-tier";
import { PassPurchase } from "../../domain/pass-purchase.aggregate";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  PASS_PURCHASE_REPOSITORY,
  PassPurchaseExternalReferenceConflictError,
  type PassPurchaseRepository,
} from "../ports/pass-purchase.repository";

export type RecordPassPurchaseCommand = Readonly<{
  organizationId: string;
  /** Référence externe idempotente (ex. id de Checkout Session Stripe en 22C) — unique en base. */
  externalReference: string;
  actorId: string;
  occurredAt: Date;
}>;

function resolveExpiresAt(purchasedAt: Date): Date | undefined {
  if (PASS_EXPIRATION_POLICY_DAYS === null) {
    return undefined;
  }
  return new Date(purchasedAt.getTime() + PASS_EXPIRATION_POLICY_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * V2 Sprint 22 (billing, étape 22A) — mission §41 : une livraison en double du même webhook Stripe
 * (22C) ne doit JAMAIS créer un second Pass. Idempotent par construction dès cette étape, avant
 * même que Stripe n'appelle ce use case : `externalReference` porte une contrainte unique en base
 * (migration), la violation de contrainte est traitée comme un succès idempotent, jamais une
 * erreur remontée à l'appelant.
 */
@Injectable()
export class RecordPassPurchaseUseCase {
  constructor(
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: RecordPassPurchaseCommand): Promise<PassPurchase> {
    const priceCents = PLAN_CATALOG[PlanTier.Pass].onePriceCents;
    if (priceCents === null) {
      throw new Error("PASS catalog entry must declare a one-time price");
    }

    const purchase = PassPurchase.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      externalReference: command.externalReference,
      priceCents,
      currency: "EUR",
      expiresAt: resolveExpiresAt(command.occurredAt),
      occurredAt: command.occurredAt,
    });

    try {
      await this.passPurchaseRepository.create(purchase);
    } catch (error) {
      if (error instanceof PassPurchaseExternalReferenceConflictError) {
        const existing = await this.passPurchaseRepository.findByExternalReference(command.externalReference);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "PassPurchased",
      resourceType: "OrganizationPassPurchase",
      resourceId: purchase.id,
      metadata: { externalReference: command.externalReference, priceCents },
    });

    // Mission §53/§54 "achat Pass confirmé... Votre Pass AO est disponible" — uniquement sur la
    // création RÉELLE (jamais sur le chemin idempotent d'un rejeu webhook Stripe, voir le catch
    // ci-dessus qui retourne avant d'atteindre cette ligne).
    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "PassPurchaseConfirmed",
          aggregateType: "OrganizationPassPurchase",
          aggregateId: purchase.id,
          payload: {},
          occurredAt: command.occurredAt,
        },
      ],
    });

    return purchase;
  }
}
