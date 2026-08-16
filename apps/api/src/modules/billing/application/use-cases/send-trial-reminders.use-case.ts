import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { resolvePriceCents } from "../../domain/plan-catalog";
import { daysRemainingInTrial, TRIAL_REMINDER_DAYS_REMAINING } from "../../domain/trial-policy";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { TRIAL_REMINDER_REPOSITORY, type TrialReminderRepository } from "../ports/trial-reminder.repository";

export type SendTrialRemindersResult = Readonly<{ checked: number; remindersSent: number }>;

const REMINDER_DAYS_SET = new Set(TRIAL_REMINDER_DAYS_REMAINING);

/**
 * V2 Sprint 25 (Trial Starter) — mission §29 "J7 : 7 jours restants ; J11 : 3 jours restants ;
 * J13 : demain". Aucun webhook Stripe ne se déclenche un jour où rien ne se passe côté paiement
 * (mission — un rappel J7 doit exister même si Stripe reste muet ce jour-là) : ce use case est
 * donc invoqué par un worker à intervalle régulier (`TrialReminderWorker`, aucun mécanisme de cron
 * existant dans ce repo), jamais par un événement Stripe. Idempotent par construction
 * (`TrialReminderRepository.recordIfNotSent`, contrainte unique réelle) — un tick qui rattrape
 * plusieurs jours de retard, ou deux instances qui tickent en même temps, n'envoient jamais deux
 * fois le même rappel.
 */
@Injectable()
export class SendTrialRemindersUseCase {
  private readonly logger = new Logger(SendTrialRemindersUseCase.name);

  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(TRIAL_REMINDER_REPOSITORY) private readonly reminderRepository: TrialReminderRepository,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<SendTrialRemindersResult> {
    const trialingSubscriptions = await this.subscriptionRepository.listTrialing();
    const now = this.clock.now();
    let remindersSent = 0;

    for (const subscription of trialingSubscriptions) {
      const trialEndsAt = subscription.trialEndsAt;
      if (!trialEndsAt) {
        // Ne devrait jamais arriver (TRIALING implique toujours une fin d'essai renseignée), mais
        // ne bloque jamais les autres organisations pour un enregistrement incohérent isolé.
        this.logger.warn(`Organization ${subscription.organizationId} is TRIALING without trialEndsAt — skipped.`);
        continue;
      }

      const daysRemaining = daysRemainingInTrial(trialEndsAt, now);
      if (!REMINDER_DAYS_SET.has(daysRemaining)) {
        continue;
      }

      const shouldSend = await this.reminderRepository.recordIfNotSent({ organizationId: subscription.organizationId, daysRemaining, occurredAt: now });
      if (!shouldSend) {
        continue;
      }

      await this.outboxWriter.write({
        organizationId: subscription.organizationId,
        events: [
          {
            eventType: "TrialEndingSoon",
            aggregateType: "OrganizationSubscription",
            aggregateId: subscription.id,
            payload: {
              daysRemaining,
              planTier: subscription.planTier,
              billingInterval: subscription.billingInterval,
              futurePriceCents: resolvePriceCents(subscription.planTier, subscription.billingInterval),
              trialEndsAt: trialEndsAt.toISOString(),
            },
            occurredAt: now,
          },
        ],
      });
      remindersSent += 1;
    }

    return { checked: trialingSubscriptions.length, remindersSent };
  }
}
