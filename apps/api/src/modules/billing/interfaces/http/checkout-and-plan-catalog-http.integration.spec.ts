import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";
import { HandleStripeWebhookUseCase } from "../../application/use-cases/handle-stripe-webhook.use-case";
import { STRIPE_CLIENT, type StripeClient, type StripeWebhookEvent } from "../../application/ports/stripe-client";
import { CreateEntitlementOverrideUseCase } from "../../application/use-cases/create-entitlement-override.use-case";
import { PlatformRole } from "../../../platform-administration";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E8 (Billing & Entitlements V2) — corrige la cause racine du bug
 * produit "l'utilisateur ne peut choisir que Starter" côté FRONTEND (voir `plan-catalog-section.tsx`)
 * et prouve ici, en HTTP + PostgreSQL réel, que le BACKEND n'a jamais été le problème :
 * `GET /billing/plan-catalog` renvoie réellement les 4 paliers, `POST /billing/checkout-sessions`
 * accepte réellement Business/Enterprise (pas seulement Starter), le RBAC Billing est autoritaire,
 * et un changement de plan (upgrade ET downgrade) modifie réellement les entitlements — mission
 * §20/§21/§22/§26. `STRIPE_CLIENT` est remplacé par un faux LOCAL (même motif déjà établi par
 * `starter-trial-local-webhook.integration.spec.ts`) — aucun appel réseau vers Stripe, mais chaque
 * ligne de code de production (guards, use cases, repositories Prisma, webhook, EntitlementService)
 * est réellement exercée contre PostgreSQL.
 */
describe("Billing — checkout & plan catalog (real HTTP + PostgreSQL, fake Stripe client)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;
  let handleStripeWebhookUseCase: HandleStripeWebhookUseCase;
  let createEntitlementOverrideUseCase: CreateEntitlementOverrideUseCase;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const orgTrialId = randomUUID();
  const userIds: string[] = [];
  const tokens = new Map<string, string>();
  let ownerBUserId: string;

  let pendingEvent: StripeWebhookEvent | undefined;
  let checkoutCallCount = 0;
  let lastCheckoutPriceId: string | undefined;

  const fakeStripeClient: StripeClient = {
    createCheckoutSession: async (input) => {
      checkoutCallCount += 1;
      lastCheckoutPriceId = input.priceId;
      return { sessionId: `cs_fake_${randomUUID()}`, url: `https://checkout.stripe.com/fake/${randomUUID()}` };
    },
    createCustomerPortalSession: async () => ({ url: `https://billing.stripe.com/fake/${randomUUID()}` }),
    constructWebhookEvent: () => {
      if (!pendingEvent) throw new Error("test did not set pendingEvent before calling execute()");
      return pendingEvent;
    },
  };

  const originalEnv = {
    starter: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    business: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
  };

  async function createActor(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "Billing HTTP Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    return { userId, token: accessTokenService.issue({ userId, sessionId }, 3600) };
  }

  async function addMembership(organizationId: string, userId: string, role: (typeof OrganizationRole)[keyof typeof OrganizationRole]): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId, role, occurredAt: new Date() }));
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-organization-id": organizationId };
  }

  function subscriptionEvent(eventId: string, organizationId: string, status: "active" | "trialing", priceId: string): StripeWebhookEvent {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      id: eventId,
      type: "customer.subscription.created",
      data: {
        id: `sub_${eventId}`,
        customer: `cus_${eventId}`,
        status,
        items: { data: [{ price: { id: priceId }, current_period_start: nowSeconds, current_period_end: nowSeconds + 30 * 24 * 60 * 60 }] },
        trial_end: status === "trialing" ? nowSeconds + 14 * 24 * 60 * 60 : undefined,
        metadata: { organizationId },
      },
    };
  }

  beforeAll(async () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly_e8_test";
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_business_monthly_e8_test";
    process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = "price_enterprise_monthly_e8_test";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(STRIPE_CLIENT).useValue(fakeStripeClient).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);
    handleStripeWebhookUseCase = moduleRef.get(HandleStripeWebhookUseCase);
    createEntitlementOverrideUseCase = moduleRef.get(CreateEntitlementOverrideUseCase);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Billing HTTP Org A", slug: `billing-http-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Billing HTTP Org B", slug: `billing-http-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgTrialId, name: "Billing HTTP Org Trialing", slug: `billing-http-org-trial-${orgTrialId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // mission §19 — une organisation DÉJÀ en essai Starter (subscription Stripe réelle, status
    // TRIALING) qui checkout Business : `existingSubscription` non-null empêche `CreateCheckoutSessionUseCase`
    // d'ajouter un second Trial (mission §11 "au plus un Trial par organisation"), mais le checkout
    // lui-même n'est jamais bloqué — même chemin générique que tout changement de palier.
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgTrialId, planTier: "STARTER", billingInterval: "MONTHLY", status: "TRIALING", source: "STRIPE", stripeCustomerId: `cus_e8_trial_${orgTrialId}` },
    });

    const owner = await createActor(`billing-owner-a-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokens.set("OWNER_A", owner.token);
    await addMembership(orgAId, owner.userId, OrganizationRole.Owner);

    const contributor = await createActor(`billing-contributor-a-${randomUUID()}@smoke.test`);
    userIds.push(contributor.userId);
    tokens.set("CONTRIBUTOR_A", contributor.token);
    await addMembership(orgAId, contributor.userId, OrganizationRole.Contributor);

    const ownerB = await createActor(`billing-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerB.userId);
    ownerBUserId = ownerB.userId;
    tokens.set("OWNER_B", ownerB.token);
    await addMembership(orgBId, ownerB.userId, OrganizationRole.Owner);

    const ownerTrial = await createActor(`billing-owner-trial-${randomUUID()}@smoke.test`);
    userIds.push(ownerTrial.userId);
    tokens.set("OWNER_TRIAL", ownerTrial.token);
    await addMembership(orgTrialId, ownerTrial.userId, OrganizationRole.Owner);
  }, 60000);

  afterAll(async () => {
    await prisma.entitlementOverride.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.organizationAoCreditBalance.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId, orgTrialId] } } });
    await prisma.stripeProcessedEvent.deleteMany({ where: { stripeEventId: { startsWith: "evt_e8_" } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId, orgTrialId] } } });
    await app.close();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = originalEnv.starter;
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = originalEnv.business;
    process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = originalEnv.enterprise;
  }, 60000);

  beforeEach(() => {
    pendingEvent = undefined;
    checkoutCallCount = 0;
    lastCheckoutPriceId = undefined;
  });
  afterEach(() => {
    pendingEvent = undefined;
  });

  describe("Root-cause proof: the plan catalog is never limited to Starter", () => {
    it("BLOQUANT — GET /billing/plan-catalog (public, unauthenticated) returns all 4 tiers with real Business/Enterprise prices", async () => {
      const res = await fetch(`${baseUrl}/api/v1/billing/plan-catalog`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { tier: string; monthlyPriceCents: number | null }[] };
      const tiers = body.items.map((entry) => entry.tier);
      expect(tiers).toEqual(["PASS", "STARTER", "BUSINESS", "ENTERPRISE"]);
      expect(body.items.find((e) => e.tier === "BUSINESS")?.monthlyPriceCents).toBe(59900);
      expect(body.items.find((e) => e.tier === "ENTERPRISE")?.monthlyPriceCents).toBe(109900);
    });

    it("BLOQUANT — POST /billing/checkout-sessions accepts Business and Enterprise, not only Starter", async () => {
      const business = await fetch(`${baseUrl}/api/v1/billing/checkout-sessions`, {
        method: "POST",
        headers: authHeaders(tokens.get("OWNER_A")!, orgAId),
        body: JSON.stringify({ target: { kind: "SUBSCRIPTION", planTier: "BUSINESS", billingInterval: "MONTHLY" } }),
      });
      expect(business.status).toBe(201);
      const businessBody = (await business.json()) as { url: string };
      expect(businessBody.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
      expect(lastCheckoutPriceId).toBe("price_business_monthly_e8_test");

      const enterprise = await fetch(`${baseUrl}/api/v1/billing/checkout-sessions`, {
        method: "POST",
        headers: authHeaders(tokens.get("OWNER_A")!, orgAId),
        body: JSON.stringify({ target: { kind: "SUBSCRIPTION", planTier: "ENTERPRISE", billingInterval: "MONTHLY" } }),
      });
      expect(enterprise.status).toBe(201);
      expect(lastCheckoutPriceId).toBe("price_enterprise_monthly_e8_test");
    });

    it("BLOQUANT — mission §19 : an org CURRENTLY TRIALING Starter can check out Business (trial does not lock the UI/backend to Starter-only)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/billing/checkout-sessions`, {
        method: "POST",
        headers: authHeaders(tokens.get("OWNER_TRIAL")!, orgTrialId),
        body: JSON.stringify({ target: { kind: "SUBSCRIPTION", planTier: "BUSINESS", billingInterval: "MONTHLY" } }),
      });
      expect(res.status).toBe(201);
      expect(lastCheckoutPriceId).toBe("price_business_monthly_e8_test");

      // Négatif — un org déjà TRIALING ne doit jamais recevoir un second Trial (mission §11).
      const trialSubscription = await prisma.organizationSubscription.findUnique({ where: { organizationId: orgTrialId } });
      expect(trialSubscription?.status).toBe("TRIALING");
      expect(trialSubscription?.planTier).toBe("STARTER");
    });
  });

  describe("Billing RBAC (mission §13/§14/§26)", () => {
    it("BLOQUANT — a CONTRIBUTOR (not billing-admin) is refused 403 on checkout, even for Starter", async () => {
      const res = await fetch(`${baseUrl}/api/v1/billing/checkout-sessions`, {
        method: "POST",
        headers: authHeaders(tokens.get("CONTRIBUTOR_A")!, orgAId),
        body: JSON.stringify({ target: { kind: "SUBSCRIPTION", planTier: "STARTER", billingInterval: "MONTHLY" } }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("BILLING_MANAGEMENT_PERMISSION_MISSING");
      expect(checkoutCallCount).toBe(0);
    });

    it("BLOQUANT — cross-tenant: OWNER of Org A cannot create a checkout session for Org B (404, never a leaked 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/billing/checkout-sessions`, {
        method: "POST",
        headers: authHeaders(tokens.get("OWNER_A")!, orgBId),
        body: JSON.stringify({ target: { kind: "SUBSCRIPTION", planTier: "STARTER", billingInterval: "MONTHLY" } }),
      });
      expect(res.status).toBe(404);
      expect(checkoutCallCount).toBe(0);
    });
  });

  describe("Payment/plan-change → entitlement (mission §20/§21/§22)", () => {
    it("BLOQUANT — a Business webhook activates Business entitlements (payment success really activates AO rights, never just a status flag)", async () => {
      pendingEvent = subscriptionEvent("evt_e8_business_1", orgBId, "active", "price_business_monthly_e8_test");
      await handleStripeWebhookUseCase.execute({ rawBody: Buffer.from("business activation"), signatureHeader: "irrelevant" });

      const res = await fetch(`${baseUrl}/api/v1/billing/entitlements`, { headers: authHeaders(tokens.get("OWNER_B")!, orgBId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { planTier: string; entitlements: string[]; quotas: { USERS_MAX: number | "UNLIMITED" } };
      expect(body.planTier).toBe("BUSINESS");
      expect(body.entitlements).toContain("ADVANCED_COLLABORATION");
      expect(body.quotas.USERS_MAX).toBe(10);
    });

    it("BLOQUANT — a subsequent Starter webhook (downgrade) really shrinks entitlements back down, never leaves stale Business rights", async () => {
      pendingEvent = subscriptionEvent("evt_e8_downgrade_1", orgBId, "active", "price_starter_monthly_e8_test");
      await handleStripeWebhookUseCase.execute({ rawBody: Buffer.from("downgrade to starter"), signatureHeader: "irrelevant" });

      const res = await fetch(`${baseUrl}/api/v1/billing/entitlements`, { headers: authHeaders(tokens.get("OWNER_B")!, orgBId) });
      const body = (await res.json()) as { planTier: string; entitlements: string[]; quotas: { USERS_MAX: number | "UNLIMITED" } };
      expect(body.planTier).toBe("STARTER");
      expect(body.entitlements).not.toContain("ADVANCED_COLLABORATION");
      expect(body.quotas.USERS_MAX).toBe(2);

      // Négatif explicite — la Membership Owner existante (créée avant le downgrade) n'est jamais
      // supprimée automatiquement, même si l'organisation dépasse désormais USERS_MAX en théorie
      // (mission §10 "ne jamais supprimer automatiquement des données ou utilisateurs").
      const membership = await prisma.organizationMembership.findFirst({ where: { organizationId: orgBId, userId: ownerBUserId } });
      expect(membership?.status).toBe("ACTIVE");
    });

    // Correctif audit externe P2.3-E8 (P1) — `GET /billing/entitlements` lisait auparavant le
    // catalogue statique directement, sans jamais consulter les overrides Platform Admin
    // (`GetOrganizationEntitlementsUseCase`). orgB est STARTER à ce stade (downgrade ci-dessus,
    // testé séquentiellement) : ni PUBLIC_API (réservé Enterprise) ni USERS_MAX > 2 ne sont dans son
    // catalogue de base — un override actif doit malgré tout apparaître dans la snapshot lue par la
    // Billing UI, exactement comme il est déjà appliqué à l'autorisation réelle.
    it("BLOQUANT — an active EntitlementOverride (Platform Admin) is really reflected in GET /billing/entitlements, not just at real authorization time", async () => {
      const occurredAt = new Date();
      await createEntitlementOverrideUseCase.execute({
        organizationId: orgBId,
        feature: "PUBLIC_API",
        featureEnabled: true,
        reason: "E8 P1 fix proof — feature override",
        actorPlatformAdministratorId: randomUUID(),
        actorPlatformRole: PlatformRole.Admin,
        occurredAt,
      });
      await createEntitlementOverrideUseCase.execute({
        organizationId: orgBId,
        quota: "USERS_MAX",
        quotaLimit: 999,
        reason: "E8 P1 fix proof — quota override",
        actorPlatformAdministratorId: randomUUID(),
        actorPlatformRole: PlatformRole.Admin,
        occurredAt,
      });

      const res = await fetch(`${baseUrl}/api/v1/billing/entitlements`, { headers: authHeaders(tokens.get("OWNER_B")!, orgBId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { planTier: string; entitlements: string[]; quotas: { USERS_MAX: number | "UNLIMITED" } };
      expect(body.planTier).toBe("STARTER");
      // L'override AUGMENTE au-delà du catalogue Starter — jamais possible sans consulter le service.
      expect(body.entitlements).toContain("PUBLIC_API");
      expect(body.quotas.USERS_MAX).toBe(999);
      // Négatif explicite — seule la cible overridée change, jamais un bypass généralisé du catalogue :
      // ADVANCED_COLLABORATION reste absent (Starter, aucun override sur cette feature).
      expect(body.entitlements).not.toContain("ADVANCED_COLLABORATION");
    });
  });
});
