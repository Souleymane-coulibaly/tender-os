import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { StripeUnrecognizedPriceError, StripeWebhookSignatureInvalidError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { FIXED_NOW, FakeStripeClient, FixedClock, InMemoryStripeProcessedEventRepository, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import type { AssignSubscriptionUseCase } from "./assign-subscription.use-case";
import type { CancelSubscriptionUseCase } from "./cancel-subscription.use-case";
import type { GrantMonthlyAoCreditsUseCase } from "./grant-monthly-ao-credits.use-case";
import { HandleStripeWebhookUseCase } from "./handle-stripe-webhook.use-case";
import type { RecordPassPurchaseUseCase } from "./record-pass-purchase.use-case";

class SequentialIdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

function stripeEventBuffer(id: string, type: string, object: unknown): Buffer {
  return Buffer.from(JSON.stringify({ id, type, data: { object } }));
}

describe("HandleStripeWebhookUseCase", () => {
  let stripeClient: FakeStripeClient;
  let processedEvents: InMemoryStripeProcessedEventRepository;
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let recordPassPurchaseUseCase: { execute: ReturnType<typeof vi.fn> };
  let assignSubscriptionUseCase: { execute: ReturnType<typeof vi.fn> };
  let cancelSubscriptionUseCase: { execute: ReturnType<typeof vi.fn> };
  let grantMonthlyAoCreditsUseCase: { execute: ReturnType<typeof vi.fn> };
  let useCase: HandleStripeWebhookUseCase;

  const originalStarterMonthly = process.env.STRIPE_PRICE_STARTER_MONTHLY;

  beforeEach(() => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly";

    stripeClient = new FakeStripeClient();
    processedEvents = new InMemoryStripeProcessedEventRepository();
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    recordPassPurchaseUseCase = { execute: vi.fn(async () => {}) };
    assignSubscriptionUseCase = { execute: vi.fn(async () => {}) };
    cancelSubscriptionUseCase = { execute: vi.fn(async () => {}) };
    grantMonthlyAoCreditsUseCase = { execute: vi.fn(async () => {}) };

    useCase = new HandleStripeWebhookUseCase(
      stripeClient,
      processedEvents,
      subscriptions,
      new FixedClock(),
      new SequentialIdGenerator(),
      recordPassPurchaseUseCase as unknown as RecordPassPurchaseUseCase,
      assignSubscriptionUseCase as unknown as AssignSubscriptionUseCase,
      cancelSubscriptionUseCase as unknown as CancelSubscriptionUseCase,
      grantMonthlyAoCreditsUseCase as unknown as GrantMonthlyAoCreditsUseCase,
    );
  });

  afterEach(() => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = originalStarterMonthly;
  });

  it("throws on an invalid signature, never processes the event", async () => {
    const rawBody = stripeEventBuffer("evt_1", "checkout.session.completed", { id: "cs_1", mode: "payment" });
    await expect(useCase.execute({ rawBody, signatureHeader: "invalid-signature" })).rejects.toBeInstanceOf(StripeWebhookSignatureInvalidError);
    expect(recordPassPurchaseUseCase.execute).not.toHaveBeenCalled();
  });

  it("checkout.session.completed (payment) records a Pass purchase for the organization in metadata", async () => {
    const rawBody = stripeEventBuffer("evt_1", "checkout.session.completed", { id: "cs_1", mode: "payment", metadata: { organizationId: "org-a" } });

    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(recordPassPurchaseUseCase.execute).toHaveBeenCalledTimes(1);
    expect(recordPassPurchaseUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", externalReference: "cs_1" }));
  });

  it("mission §41 — a duplicate webhook delivery (same event id) is a no-op, never a second Pass credit", async () => {
    const rawBody = stripeEventBuffer("evt_1", "checkout.session.completed", { id: "cs_1", mode: "payment", metadata: { organizationId: "org-a" } });

    await useCase.execute({ rawBody, signatureHeader: "valid" });
    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(recordPassPurchaseUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("checkout.session.completed (subscription) is a no-op — subscription assignment is driven by customer.subscription.* instead", async () => {
    const rawBody = stripeEventBuffer("evt_1", "checkout.session.completed", { id: "cs_1", mode: "subscription", metadata: { organizationId: "org-a" } });

    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(recordPassPurchaseUseCase.execute).not.toHaveBeenCalled();
    expect(assignSubscriptionUseCase.execute).not.toHaveBeenCalled();
  });

  it("customer.subscription.created assigns the subscription resolved from the Price ID", async () => {
    const rawBody = stripeEventBuffer("evt_2", "customer.subscription.created", {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { id: "price_starter_monthly" } }] },
      current_period_start: Math.floor(FIXED_NOW.getTime() / 1000),
      current_period_end: Math.floor(FIXED_NOW.getTime() / 1000) + 2_592_000,
      metadata: { organizationId: "org-a" },
    });

    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(assignSubscriptionUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a", planTier: "STARTER", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }),
    );
  });

  it("correctif audit Codex 22C (P1-02) — an unrecognized Price ID on a subscription event throws (fail-closed), never a silent success", async () => {
    const rawBody = stripeEventBuffer("evt_2", "customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { id: "price_unknown" } }] },
      current_period_start: 0,
      current_period_end: 0,
      metadata: { organizationId: "org-a" },
    });

    await expect(useCase.execute({ rawBody, signatureHeader: "valid" })).rejects.toBeInstanceOf(StripeUnrecognizedPriceError);

    expect(assignSubscriptionUseCase.execute).not.toHaveBeenCalled();
    const outcome = await processedEvents.recordForProcessing({ id: "id-retry-probe", stripeEventId: "evt_2", eventType: "customer.subscription.updated", receivedAt: FIXED_NOW });
    // L'événement a été marqué FAILED (jamais PROCESSED) : un retry Stripe ultérieur pour le MÊME
    // event id doit rester rejouable.
    expect(outcome).toEqual({ outcome: "RETRY", recordId: "id-1" });
  });

  it("correctif audit Codex 22C (P1-01) — a Stripe retry of a previously FAILED event is reprocessed, never silently skipped", async () => {
    const rawBody = stripeEventBuffer("evt_2", "customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { id: "price_unknown" } }] },
      current_period_start: 0,
      current_period_end: 0,
      metadata: { organizationId: "org-a" },
    });

    await expect(useCase.execute({ rawBody, signatureHeader: "valid" })).rejects.toBeInstanceOf(StripeUnrecognizedPriceError);
    expect(assignSubscriptionUseCase.execute).not.toHaveBeenCalled();

    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_unknown";
    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(assignSubscriptionUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("customer.subscription.deleted cancels the organization's subscription", async () => {
    const rawBody = stripeEventBuffer("evt_3", "customer.subscription.deleted", {
      id: "sub_1",
      customer: "cus_1",
      status: "canceled",
      items: { data: [] },
      current_period_start: 0,
      current_period_end: 0,
      metadata: { organizationId: "org-a" },
    });

    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(cancelSubscriptionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a" }));
  });

  it("invoice.paid for a subscription grants that month's AO credits, period derived from period_start", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-row-1",
        organizationId: "org-a",
        planTier: PlanTier.Starter,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        stripeSubscriptionId: "sub_1",
        occurredAt: FIXED_NOW,
      }),
    );
    const periodStart = Date.UTC(2026, 7, 1) / 1000; // 2026-08-01
    const rawBody = stripeEventBuffer("evt_4", "invoice.paid", { subscription: "sub_1", period_start: periodStart });

    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(grantMonthlyAoCreditsUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", period: "2026-08" }));
  });

  it("invoice.paid without a subscription (one-time invoice) never grants credits", async () => {
    const rawBody = stripeEventBuffer("evt_5", "invoice.paid", { subscription: null, period_start: 0 });

    await useCase.execute({ rawBody, signatureHeader: "valid" });

    expect(grantMonthlyAoCreditsUseCase.execute).not.toHaveBeenCalled();
  });

  it("an unmapped event type is received and journaled, never fatal", async () => {
    const rawBody = stripeEventBuffer("evt_6", "customer.updated", { id: "cus_1" });

    await expect(useCase.execute({ rawBody, signatureHeader: "valid" })).resolves.toBeUndefined();
  });
});
