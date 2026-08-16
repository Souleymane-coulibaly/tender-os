import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import {
  FakeOutboxWriter,
  FixedClock,
  InMemoryOrganizationSubscriptionRepository,
  InMemoryTrialReminderRepository,
} from "../../test-support/fakes";
import { SendTrialRemindersUseCase } from "./send-trial-reminders.use-case";

const ORG_A = "org-a";
const ORG_B = "org-b";
const NOW = new Date("2026-08-15T09:00:00Z");

function trialing(organizationId: string, trialEndsAt: Date, id = `sub-${organizationId}`): OrganizationSubscription {
  return OrganizationSubscription.create({
    id,
    organizationId,
    planTier: PlanTier.Starter,
    billingInterval: BillingInterval.Monthly,
    source: PlanSource.Stripe,
    status: SubscriptionStatus.Trialing,
    trialEndsAt,
    occurredAt: NOW,
  });
}

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("SendTrialRemindersUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let reminders: InMemoryTrialReminderRepository;
  let outbox: FakeOutboxWriter;
  let useCase: SendTrialRemindersUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    reminders = new InMemoryTrialReminderRepository();
    outbox = new FakeOutboxWriter();
    useCase = new SendTrialRemindersUseCase(subscriptions, reminders, outbox, new FixedClock(NOW));
  });

  it("mission §29 — J7 (7 jours restants) triggers a TrialEndingSoon reminder", async () => {
    await subscriptions.save(trialing(ORG_A, daysFromNow(7)));

    const result = await useCase.execute();

    expect(result).toEqual({ checked: 1, remindersSent: 1 });
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]).toMatchObject({ eventType: "TrialEndingSoon", payload: { daysRemaining: 7 } });
  });

  it("mission §29 — J11 (3 jours restants) and J13 (1 jour restant) also trigger, but any other day does not", async () => {
    await subscriptions.save(trialing(ORG_A, daysFromNow(3), "sub-3"));
    const threeDays = await useCase.execute();
    expect(threeDays.remindersSent).toBe(1);
    expect(outbox.events[0]?.payload).toMatchObject({ daysRemaining: 3 });

    outbox.events.length = 0;
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    await subscriptions.save(trialing(ORG_A, daysFromNow(1), "sub-1"));
    useCase = new SendTrialRemindersUseCase(subscriptions, reminders, outbox, new FixedClock(NOW));
    const oneDay = await useCase.execute();
    expect(oneDay.remindersSent).toBe(1);
    expect(outbox.events[0]?.payload).toMatchObject({ daysRemaining: 1 });

    outbox.events.length = 0;
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    await subscriptions.save(trialing(ORG_A, daysFromNow(5), "sub-5"));
    useCase = new SendTrialRemindersUseCase(subscriptions, reminders, outbox, new FixedClock(NOW));
    const fiveDays = await useCase.execute();
    expect(fiveDays.remindersSent).toBe(0);
    expect(outbox.events).toHaveLength(0);
  });

  it("is idempotent — a second tick the same day never sends the same reminder twice (worker overlap / retry)", async () => {
    await subscriptions.save(trialing(ORG_A, daysFromNow(7)));

    const first = await useCase.execute();
    const second = await useCase.execute();

    expect(first.remindersSent).toBe(1);
    expect(second.remindersSent).toBe(0);
    expect(outbox.events).toHaveLength(1);
  });

  it("checks every TRIALING organization independently, never cross-contaminating reminders", async () => {
    await subscriptions.save(trialing(ORG_A, daysFromNow(7)));
    await subscriptions.save(trialing(ORG_B, daysFromNow(3)));

    const result = await useCase.execute();

    expect(result).toEqual({ checked: 2, remindersSent: 2 });
    const orgAEvent = outbox.events.find((e) => e.aggregateId === `sub-${ORG_A}`);
    const orgBEvent = outbox.events.find((e) => e.aggregateId === `sub-${ORG_B}`);
    expect(orgAEvent?.payload).toMatchObject({ daysRemaining: 7 });
    expect(orgBEvent?.payload).toMatchObject({ daysRemaining: 3 });
  });

  it("never touches an ACTIVE (non-TRIALING) subscription", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-active",
        organizationId: ORG_A,
        planTier: PlanTier.Starter,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        occurredAt: NOW,
      }),
    );

    const result = await useCase.execute();

    expect(result).toEqual({ checked: 0, remindersSent: 0 });
    expect(outbox.events).toHaveLength(0);
  });
});
