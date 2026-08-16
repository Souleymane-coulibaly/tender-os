import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { BillingInterval } from "../../domain/billing-interval";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { resolvePriceCents } from "../../domain/plan-catalog";
import type { SubscriptionPlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";

export type AssignSubscriptionCommand = Readonly<{
  organizationId: string;
  planTier: SubscriptionPlanTier;
  billingInterval: BillingInterval;
  source: PlanSource;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  currentPeriodStart?: Date | undefined;
  currentPeriodEnd?: Date | undefined;
  /** V2 Sprint 25 (Trial Starter) — statut RÉEL lu d'un webhook Stripe (jamais deviné). Absent =
   *  comportement historique inchangé (MANUAL/GRANTED, et STRIPE hors Trial qui n'avait jamais
   *  besoin de le fournir avant ce sprint) : la création par défaut reste ACTIVE, et une
   *  réassignation existante ne touche toujours pas au statut quand ce champ est omis. */
  status?: SubscriptionStatus | undefined;
  trialEndsAt?: Date | undefined;
  actorId: string;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22A) — création OU changement de palier/intervalle sur la ligne
 * unique de l'organisation (jamais deux abonnements). Réutilisable par STRIPE (22C, checkout
 * complété) et MANUAL/GRANTED (22D, assignation Platform Admin) — la seule différence entre les
 * deux est `source`, jamais une logique dupliquée.
 */
@Injectable()
export class AssignSubscriptionUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: AssignSubscriptionCommand): Promise<OrganizationSubscription> {
    const existing = await this.subscriptionRepository.findByOrganizationId(command.organizationId);

    if (!existing) {
      const subscription = OrganizationSubscription.create({
        id: randomUUID(),
        organizationId: command.organizationId,
        planTier: command.planTier,
        billingInterval: command.billingInterval,
        source: command.source,
        stripeCustomerId: command.stripeCustomerId,
        stripeSubscriptionId: command.stripeSubscriptionId,
        currentPeriodStart: command.currentPeriodStart,
        currentPeriodEnd: command.currentPeriodEnd,
        status: command.status,
        trialEndsAt: command.trialEndsAt,
        occurredAt: command.occurredAt,
      });
      await this.subscriptionRepository.save(subscription);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "PlanAssigned",
        resourceType: "OrganizationSubscription",
        resourceId: subscription.id,
        metadata: { planTier: command.planTier, billingInterval: command.billingInterval, source: command.source },
      });

      // V2 Sprint 25 (Trial Starter) — première assignation déjà TRIALING (cas normal : le premier
      // webhook `customer.subscription.created` d'un Trial Starter porte déjà ce statut). Jamais
      // émis pour MANUAL/GRANTED (`command.status` toujours absent sur ces chemins).
      if (command.status === SubscriptionStatus.Trialing) {
        await this.outboxWriter.write({
          organizationId: command.organizationId,
          events: [
            {
              eventType: "TrialStarted",
              aggregateType: "OrganizationSubscription",
              aggregateId: subscription.id,
              payload: {
                planTier: command.planTier,
                billingInterval: command.billingInterval,
                futurePriceCents: resolvePriceCents(command.planTier, command.billingInterval),
                trialEndsAt: command.trialEndsAt?.toISOString(),
              },
              occurredAt: command.occurredAt,
            },
          ],
        });
      }

      return subscription;
    }

    const previousPlanTier = existing.planTier;
    const previousSource = existing.source;
    const previousStatus = existing.status;
    const planChanged = previousPlanTier !== command.planTier;
    const intervalChanged = existing.billingInterval !== command.billingInterval;
    const sourceChanged = previousSource !== command.source;

    // Correctif audit Codex 22D (P1-01) — `reassign` remplace TOUJOURS source/métadonnées Stripe/
    // périodes, jamais un `changePlan` qui les aurait silencieusement conservées d'une précédente
    // assignation (voir le commentaire de l'agrégat). Ne touche TOUJOURS PAS au statut.
    existing.reassign({
      planTier: command.planTier,
      billingInterval: command.billingInterval,
      source: command.source,
      stripeCustomerId: command.stripeCustomerId,
      stripeSubscriptionId: command.stripeSubscriptionId,
      currentPeriodStart: command.currentPeriodStart,
      currentPeriodEnd: command.currentPeriodEnd,
      occurredAt: command.occurredAt,
    });

    // V2 Sprint 25 (Trial Starter) — transition de statut explicite, UNIQUEMENT quand l'appelant
    // (webhook Stripe) fournit un statut réellement lu. Jamais pour MANUAL/GRANTED (`command.status`
    // toujours absent sur ces chemins, `reassign` ci-dessus reste alors la SEULE écriture).
    if (command.status !== undefined) {
      existing.updateFromStripeStatus({ status: command.status, trialEndsAt: command.trialEndsAt, occurredAt: command.occurredAt });
    }
    await this.subscriptionRepository.save(existing);

    if (command.status === SubscriptionStatus.Trialing && previousStatus !== SubscriptionStatus.Trialing) {
      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TrialStarted",
            aggregateType: "OrganizationSubscription",
            aggregateId: existing.id,
            payload: {
              planTier: command.planTier,
              billingInterval: command.billingInterval,
              futurePriceCents: resolvePriceCents(command.planTier, command.billingInterval),
              trialEndsAt: command.trialEndsAt?.toISOString(),
            },
            occurredAt: command.occurredAt,
          },
        ],
      });
    }
    // Mission §21 "TRIALING -> ACTIVE" (jour 14, premier paiement réussi) — jamais émis pour une
    // bascule ACTIVE qui ne vient pas d'un Trial (ex. réactivation après CANCELED), ni pour une
    // sortie de Trial vers autre chose que ACTIVE (PAST_DUE en cas d'échec de paiement — mission
    // §23, aucun événement "converti" dans ce cas, `SubscriptionPaymentFailed` s'en charge déjà).
    if (previousStatus === SubscriptionStatus.Trialing && command.status === SubscriptionStatus.Active) {
      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TrialConverted",
            aggregateType: "OrganizationSubscription",
            aggregateId: existing.id,
            payload: {
              planTier: command.planTier,
              billingInterval: command.billingInterval,
              priceCents: resolvePriceCents(command.planTier, command.billingInterval),
            },
            occurredAt: command.occurredAt,
          },
        ],
      });
    }

    if (planChanged) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "PlanChanged",
        resourceType: "OrganizationSubscription",
        resourceId: existing.id,
        metadata: { fromPlanTier: previousPlanTier, toPlanTier: command.planTier },
      });
      // Mission §54 "changement de plan" — jamais un acteur org-member évident ici (webhook Stripe
      // ou Platform Admin, aucun des deux n'est un membre de CETTE organisation) : notifie OWNER/
      // ORGANIZATION_ADMIN, jamais `command.actorId`.
      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "SubscriptionPlanChanged",
            aggregateType: "OrganizationSubscription",
            aggregateId: existing.id,
            payload: { fromPlanTier: previousPlanTier, toPlanTier: command.planTier },
            occurredAt: command.occurredAt,
          },
          // V2 Sprint 22 (billing, étape 22E, décision utilisateur "éventuellement changement de
          // plan si cela fait passer l'organisation dans un état over-quota") — type d'événement
          // DISTINCT de `SubscriptionPlanChanged` (jamais un second handler sur le même eventType :
          // `CompositeOutboxEventDispatcher` n'admet qu'UN SEUL handler par eventType et écraserait
          // silencieusement `SubscriptionPlanChangedNotificationOutboxHandler`, voir
          // `outbox/infrastructure/composite-outbox-event-dispatcher.ts`). Un changement de PALIER
          // change la LIMITE (dénominateur), jamais l'usage lui-même — peut à lui seul faire
          // franchir un seuil 80%/100% sans qu'aucune action d'usage n'ait eu lieu (ex. downgrade
          // Business -> Starter avec 15 utilisateurs déjà actifs).
          {
            eventType: "SubscriptionPlanChangedQuotaRecheck",
            aggregateType: "OrganizationSubscription",
            aggregateId: existing.id,
            payload: {},
            occurredAt: command.occurredAt,
          },
        ],
      });
    }
    if (intervalChanged) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "BillingIntervalChanged",
        resourceType: "OrganizationSubscription",
        resourceId: existing.id,
        metadata: { toBillingInterval: command.billingInterval },
      });
    }
    if (sourceChanged) {
      // Mission §55 — `SubscriptionChanged`, distinct de `PlanChanged` (palier) : trace
      // spécifiquement la provenance (STRIPE ↔ MANUAL ↔ GRANTED), jamais absorbée silencieusement.
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "SubscriptionChanged",
        resourceType: "OrganizationSubscription",
        resourceId: existing.id,
        metadata: { fromSource: previousSource, toSource: command.source },
      });
    }

    return existing;
  }
}
