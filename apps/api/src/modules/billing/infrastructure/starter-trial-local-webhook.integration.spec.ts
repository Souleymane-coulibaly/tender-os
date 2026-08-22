import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../../../app.module";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../application/services/entitlement.service";
import { HandleStripeWebhookUseCase } from "../application/use-cases/handle-stripe-webhook.use-case";
import { STRIPE_CLIENT, type StripeClient, type StripeWebhookEvent } from "../application/ports/stripe-client";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.2, mission §9 (STARTER TRIAL) — "ajouter si possible un test
 * d'intégration couvrant le flux local checkout/webhook sans appeler réellement Stripe". Boot
 * l'`AppModule` complet (mêmes repositories Prisma réels que la production) mais remplace UNIQUEMENT
 * `STRIPE_CLIENT` par un faux local : aucun appel réseau vers Stripe, tout le reste (webhook
 * handling -> OrganizationSubscription -> AoCreditLedger -> EntitlementService) est le VRAI code de
 * production contre PostgreSQL réel. `CreateCheckoutSessionUseCase` elle-même n'est PAS exercée ici
 * (elle ne fait qu'appeler `stripeClient.createCheckoutSession`, déjà entièrement couverte par
 * `create-checkout-session.use-case.spec.ts`, y compris l'éligibilité Trial "un seul par
 * organisation, jamais dérivée d'un email" et l'idempotence de la clé Stripe) — ce fichier couvre le
 * morceau non couvert ailleurs : la RÉCEPTION du webhook `customer.subscription.created`
 * (status=trialing) jusqu'à l'entitlement effectif. Une organisation FRAÎCHE par test (jamais
 * partagée) — chaque test reste self-contained, jamais confondu par l'état laissé par un autre.
 */
describe("Starter Trial — local webhook flow (real Postgres, fake Stripe client, no network call)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let handleStripeWebhookUseCase: HandleStripeWebhookUseCase;
  let entitlementService: EntitlementService;

  let pendingEvent: StripeWebhookEvent | undefined;
  const createdOrganizationIds: string[] = [];

  const fakeStripeClient: StripeClient = {
    createCheckoutSession: async () => {
      throw new Error("never called in this local-webhook-only test");
    },
    createCustomerPortalSession: async () => {
      throw new Error("never called in this local-webhook-only test");
    },
    // Jamais de vérification de signature cryptographique réelle ici (mission "sans appeler
    // réellement Stripe") — le "rawBody" est directement l'événement synthétique préparé par le
    // test, `constructWebhookEvent` se contente de le retourner tel quel.
    constructWebhookEvent: () => {
      if (!pendingEvent) throw new Error("test did not set pendingEvent before calling execute()");
      return pendingEvent;
    },
  };

  const originalStarterMonthlyPriceId = process.env.STRIPE_PRICE_STARTER_MONTHLY;

  beforeAll(async () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly_local_test";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(STRIPE_CLIENT).useValue(fakeStripeClient).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    handleStripeWebhookUseCase = moduleRef.get(HandleStripeWebhookUseCase);
    entitlementService = moduleRef.get(ENTITLEMENT_SERVICE);
  }, 60000);

  afterAll(async () => {
    if (createdOrganizationIds.length > 0) {
      await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organizationAoCreditBalance.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.auditLog.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      // V2 Sprint 25 (Trial Starter) écrit désormais dans l'Outbox (TrialEndingSoon/SubscriptionPlanChangedQuotaRecheck
      // selon le chemin) — à supprimer AVANT l'organisation, sinon FK `outbox_events_organization_id_fkey` violée
      // (même correctif déjà appliqué ailleurs, ex. `dce-http.integration.spec.ts`).
      await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    }
    await prisma.stripeProcessedEvent.deleteMany({ where: { stripeEventId: { startsWith: "evt_starter_trial_local_" } } });
    await app.close();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = originalStarterMonthlyPriceId;
  });

  beforeEach(() => {
    pendingEvent = undefined;
  });
  afterEach(() => {
    pendingEvent = undefined;
  });

  async function seedOrganization(): Promise<string> {
    const organizationId = randomUUID();
    createdOrganizationIds.push(organizationId);
    await prisma.organization.create({
      data: { id: organizationId, name: "Starter Trial Local Webhook Test Org", slug: `starter-trial-local-webhook-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    return organizationId;
  }

  function trialSubscriptionCreatedEvent(eventId: string, organizationId: string, now: Date): StripeWebhookEvent {
    const currentPeriodStartSeconds = Math.floor(now.getTime() / 1000);
    const trialEndSeconds = currentPeriodStartSeconds + 14 * 24 * 60 * 60;
    return {
      id: eventId,
      type: "customer.subscription.created",
      data: {
        id: `sub_${eventId}`,
        customer: `cus_${eventId}`,
        status: "trialing",
        items: { data: [{ price: { id: "price_starter_monthly_local_test" }, current_period_start: currentPeriodStartSeconds, current_period_end: trialEndSeconds }] },
        trial_end: trialEndSeconds,
        metadata: { organizationId },
      },
    };
  }

  it("mission TEST 17 — a local (non-network) customer.subscription.created(status=trialing) webhook activates TRIALING, grants the trial AO credit, and authorizes core operations", async () => {
    const organizationId = await seedOrganization();
    const now = new Date();
    pendingEvent = trialSubscriptionCreatedEvent("evt_starter_trial_local_1", organizationId, now);

    await handleStripeWebhookUseCase.execute({ rawBody: Buffer.from("irrelevant, fake client ignores this"), signatureHeader: "irrelevant" });

    const subscriptionRow = await prisma.organizationSubscription.findUnique({ where: { organizationId } });
    expect(subscriptionRow?.status).toBe("TRIALING");
    expect(subscriptionRow?.planTier).toBe("STARTER");

    const balanceRow = await prisma.organizationAoCreditBalance.findUnique({ where: { organizationId } });
    expect(balanceRow?.balance).toBe(1);

    // Entitlement réellement actif — une opération cœur AO doit être autorisée pour un Tender
    // arbitraire de cette organisation (jamais besoin d'un Tender réel pour le prouver : la
    // branche abonnement d'EntitlementService.canOperateOnTender ne dépend d'aucun Tender existant).
    const arbitraryTenderId = randomUUID();
    expect(await entitlementService.canOperateOnTender(organizationId, arbitraryTenderId)).toBe(true);
  });

  it("mission TEST 18 — a redelivered webhook (SAME Stripe event.id) never grants a second trial credit (idempotent at the DB level, never a network round-trip to detect it)", async () => {
    const organizationId = await seedOrganization();
    const now = new Date();
    const event = trialSubscriptionCreatedEvent("evt_starter_trial_local_2", organizationId, now);

    pendingEvent = event;
    await handleStripeWebhookUseCase.execute({ rawBody: Buffer.from("first delivery"), signatureHeader: "irrelevant" });

    pendingEvent = event; // Stripe redélivre EXACTEMENT le même evt.id
    await handleStripeWebhookUseCase.execute({ rawBody: Buffer.from("redelivery"), signatureHeader: "irrelevant" });

    const balanceRow = await prisma.organizationAoCreditBalance.findUnique({ where: { organizationId } });
    expect(balanceRow?.balance).toBe(1); // jamais 2 malgré la redélivraison
  });
});
