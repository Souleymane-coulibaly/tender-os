import { randomUUID, createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { WebhookDeliveryWorker } from "../../infrastructure/webhook-delivery.worker";
import { OutboxPublisherWorker } from "../../../outbox/infrastructure/outbox-publisher.worker";

/**
 * V2 Sprint 16 (Integration Hub) — preuve réelle contre HTTP + PostgreSQL (NestJS), même motif que
 * `dashboard-http.integration.spec.ts`/`response-package-http.integration.spec.ts`. Couvre les
 * scénarios §135 A (webhook réel signé bout-en-bout via un VRAI serveur HTTP local) et B (Public
 * API via clé API réelle), ainsi que les tests P1 bloquants (scope/cross-tenant/client-scope/SSRF/
 * HMAC).
 */
describe("Integration Hub (integrations) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let webhookWorker: WebhookDeliveryWorker;
  let outboxWorker: OutboxPublisherWorker;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenContributorA: string;
  let ownerAUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "Integrations HTTP Test", termsAccepted: true }) });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }));
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }
  function apiKeyHeaders(fullKey: string): Record<string, string> {
    return { Authorization: `Bearer ${fullKey}`, "Content-Type": "application/json" };
  }

  async function createClient(organizationId: string, userId: string, name: string): Promise<string> {
    const client = await prisma.clientAccount.create({ data: { id: randomUUID(), organizationId, name, nameNormalized: name.toLowerCase(), status: "ACTIVE", createdBy: userId } });
    return client.id;
  }
  async function createTender(organizationId: string, clientAccountId: string, userId: string, title: string): Promise<string> {
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId, clientAccountId, title, status: "IN_ANALYSIS", tags: [], createdBy: userId } });
    return tender.id;
  }

  async function createApiKey(token: string, organizationId: string, body: Record<string, unknown>): Promise<{ fullKey: string; id: string }> {
    const res = await fetch(`${baseUrl}/api/v1/integrations/api-keys`, { method: "POST", headers: authHeaders(token, organizationId), body: JSON.stringify(body) });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { fullKey: string; apiKey: { id: string } };
    return { fullKey: created.fullKey, id: created.apiKey.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);
    webhookWorker = moduleRef.get(WebhookDeliveryWorker);
    outboxWorker = moduleRef.get(OutboxPublisherWorker);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Integrations Org A HTTP", slug: `integrations-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Integrations Org B HTTP", slug: `integrations-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01) — API Keys/Webhooks sont
    // désormais des fonctionnalités Enterprise (mission §16 "ne pas casser techniquement
    // l'Integration Hub" pour Enterprise) : ce test exerce le module Sprint 16 lui-même, jamais le
    // gating par plan, donc les deux organisations reçoivent un abonnement Enterprise ACTIVE.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL", updatedAt: new Date() },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL", updatedAt: new Date() },
      ],
    });

    const ownerA = await registerAndLogin(`integrations-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`integrations-owner-b-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`integrations-contributor-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, contributorA.userId);
    tokenOwnerA = ownerA.token;
    tokenContributorA = contributorA.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
  }, 60000);

  afterAll(async () => {
    await prisma.webhookDelivery.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.webhookSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.apiKey.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  /** Checkpoint TENDEROS-2.1-P2.3-E6 (mission §29/§33/§48) — `IntegrationPermission.Read` est
   *  restreint à OWNER/ORGANIZATION_ADMIN (`ROLE_INTEGRATION_PERMISSIONS`), contrairement à la
   *  plupart des autres modules où la lecture reste ouverte à tout membre (Billing, AI models —
   *  voir `ai-benchmark-http.integration.spec.ts` "READ_ONLY peut lire /ai-models"). Seule la
   *  dénégation en ÉCRITURE (POST, ligne suivante) était prouvée en HTTP réel jusqu'ici — cette
   *  preuve manquante est exactement ce qui a justifié de masquer "Intégrations" de la navigation
   *  pour un CONTRIBUTOR (`nav-sections.ts`, `isVisible: isOrganizationAdmin`) : sans elle, ce
   *  masquage de nav aurait été une supposition, jamais une preuve.
   */
  it("BLOQUANT — mission §29/§33 : un CONTRIBUTOR ne peut même pas LISTER les clés API de son organisation (lecture, pas seulement écriture, restreinte à OWNER/ADMIN)", async () => {
    const forbiddenList = await fetch(`${baseUrl}/api/v1/integrations/api-keys`, { headers: authHeaders(tokenContributorA, orgAId) });
    expect(forbiddenList.status).toBe(403);

    const allowedList = await fetch(`${baseUrl}/api/v1/integrations/api-keys`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(allowedList.status).toBe(200);
  });

  it("BLOQUANT — mission §60/§96/§97/§98 : seul OWNER/ADMIN peut créer une clé, la clé brute n'apparaît qu'à la création, jamais stockée en clair en base", async () => {
    const forbidden = await fetch(`${baseUrl}/api/v1/integrations/api-keys`, { method: "POST", headers: authHeaders(tokenContributorA, orgAId), body: JSON.stringify({ name: "x", scopes: ["tenders:read"] }) });
    expect(forbidden.status).toBe(403);

    const created = await createApiKey(tokenOwnerA, orgAId, { name: "n8n prod", scopes: ["tenders:read"] });
    expect(created.fullKey).toMatch(/^tos_live_/);

    const row = await prisma.apiKey.findUnique({ where: { id: created.id } });
    expect(row).not.toBeNull();
    expect(row!.keyHash).not.toBe(created.fullKey);
    expect(JSON.stringify(row)).not.toContain(created.fullKey);

    const listRes = await fetch(`${baseUrl}/api/v1/integrations/api-keys`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const list = (await listRes.json()) as { keyPrefix: string }[];
    expect(JSON.stringify(list)).not.toContain(created.fullKey);
  });

  it("BLOQUANT — mission §135 scénario B : n8n HTTP Request -> GET /api/v1/public/tenders avec une vraie clé API, scope vérifié, tenant scope vérifié", async () => {
    const clientA = await createClient(orgAId, ownerAUserId, `Client Public API ${randomUUID()}`);
    await createTender(orgAId, clientA, ownerAUserId, `Public API Tender ${randomUUID()}`);

    const key = await createApiKey(tokenOwnerA, orgAId, { name: "public api test", scopes: ["tenders:read"] });

    const res = await fetch(`${baseUrl}/api/v1/public/tenders`, { headers: apiKeyHeaders(key.fullKey) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("BLOQUANT — scope insuffisant refusé même si la clé est par ailleurs valide (mission §99)", async () => {
    const key = await createApiKey(tokenOwnerA, orgAId, { name: "tasks only", scopes: ["tasks:read"] });
    const res = await fetch(`${baseUrl}/api/v1/public/tenders`, { headers: apiKeyHeaders(key.fullKey) });
    expect(res.status).toBe(403);
  });

  it("BLOQUANT — cross-tenant : une clé de l'Org A ne peut jamais lire un Tender de l'Org B (mission §101)", async () => {
    const clientB = await createClient(orgBId, (await registerAndLogin(`dummy-${randomUUID()}@smoke.test`)).userId, `Client B ${randomUUID()}`);
    const tenderB = await createTender(orgBId, clientB, ownerAUserId, `Org B Tender ${randomUUID()}`);

    const key = await createApiKey(tokenOwnerA, orgAId, { name: "cross-tenant test", scopes: ["tenders:read"] });
    const res = await fetch(`${baseUrl}/api/v1/public/tenders/${tenderB}`, { headers: apiKeyHeaders(key.fullKey) });
    expect(res.status).toBe(404);
  });

  it("BLOQUANT — client scope : une clé restreinte à Client A ne peut jamais lire un Tender de Client B de la MÊME organisation (mission §100/§102)", async () => {
    const clientA = await createClient(orgAId, ownerAUserId, `Client Scope A ${randomUUID()}`);
    const clientB = await createClient(orgAId, ownerAUserId, `Client Scope B ${randomUUID()}`);
    const tenderA = await createTender(orgAId, clientA, ownerAUserId, `Scope A Tender ${randomUUID()}`);
    const tenderB = await createTender(orgAId, clientB, ownerAUserId, `Scope B Tender ${randomUUID()}`);

    const key = await createApiKey(tokenOwnerA, orgAId, { name: "client scoped", scopes: ["tenders:read"], allowedClientAccountIds: [clientA] });

    const okRes = await fetch(`${baseUrl}/api/v1/public/tenders/${tenderA}`, { headers: apiKeyHeaders(key.fullKey) });
    expect(okRes.status).toBe(200);

    const blockedRes = await fetch(`${baseUrl}/api/v1/public/tenders/${tenderB}`, { headers: apiKeyHeaders(key.fullKey) });
    expect(blockedRes.status).toBe(404);
  });

  it("BLOQUANT — révocation immédiatement effective (mission §12/§96)", async () => {
    const key = await createApiKey(tokenOwnerA, orgAId, { name: "to revoke", scopes: ["tenders:read"] });

    const before = await fetch(`${baseUrl}/api/v1/public/tenders`, { headers: apiKeyHeaders(key.fullKey) });
    expect(before.status).toBe(200);

    const revokeRes = await fetch(`${baseUrl}/api/v1/integrations/api-keys/${key.id}/revoke`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(revokeRes.status).toBe(200);

    const after = await fetch(`${baseUrl}/api/v1/public/tenders`, { headers: apiKeyHeaders(key.fullKey) });
    expect(after.status).toBe(401);
  });

  it("BLOQUANT — expiration : une clé expirée est refusée (mission §13/§96)", async () => {
    const key = await createApiKey(tokenOwnerA, orgAId, { name: "expired", scopes: ["tenders:read"], expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const res = await fetch(`${baseUrl}/api/v1/public/tenders`, { headers: apiKeyHeaders(key.fullKey) });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid API key (never distinguishing the failure reason)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/tenders`, { headers: apiKeyHeaders("tos_live_totally-invalid-key") });
    expect(res.status).toBe(401);
  });

  it("BLOQUANT — SSRF : localhost/127.0.0.1/::1/réseau privé refusés à la création d'un webhook (mission §31/§95)", async () => {
    // Défensif : cette policy ne doit JAMAIS être désactivée en dehors des tests qui l'exercent
    // explicitement (voir §135 scénario A / §105 ci-dessous, qui la réactivent puis la restaurent).
    delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    const targets = ["http://localhost/hook", "http://127.0.0.1:9999/hook", "http://[::1]/hook", "http://192.168.1.5/hook", "http://169.254.169.254/latest/meta-data/", "ftp://example.com/hook"];
    for (const endpointUrl of targets) {
      const res = await fetch(`${baseUrl}/api/v1/integrations/webhooks`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ endpointUrl, events: ["tender.created"] }) });
      expect(res.status, `expected ${endpointUrl} to be rejected`).toBe(422);
    }
  });

  it("BLOQUANT — mission §135 scénario A : Tender créé -> Outbox -> handler -> WebhookDelivery -> HTTP réel -> signature HMAC vérifiée indépendamment -> SUCCEEDED", async () => {
    const receivedRequests: { headers: Record<string, string>; rawBody: string }[] = [];
    let testServer!: Server;
    const testServerPort = await new Promise<number>((resolve) => {
      testServer = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          receivedRequests.push({ headers: req.headers as Record<string, string>, rawBody: Buffer.concat(chunks).toString("utf8") });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      });
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    // Échappatoire de test EXPLICITE (mission §95) — un serveur de test tourne forcément en local ;
    // sans elle, ce scénario ne peut physiquement pas exercer une vraie livraison HTTP. Jamais
    // activée en production (voir domain/services/webhook-url-safety.ts), restaurée dans `finally`.
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "true";
    try {
      const webhookRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ endpointUrl: `http://127.0.0.1:${testServerPort}/webhook`, events: ["tender.created"] }),
      });
      expect(webhookRes.status).toBe(201);
      const webhook = (await webhookRes.json()) as { secret: string; subscription: { id: string } };

      const clientA = await createClient(orgAId, ownerAUserId, `Client Webhook E2E ${randomUUID()}`);
      const tenderTitle = `Webhook E2E Tender ${randomUUID()}`;
      const createRes = await fetch(`${baseUrl}/api/v1/tenders`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: tenderTitle, clientAccountId: clientA }) });
      expect(createRes.status).toBe(201);

      // Mission §36 — jamais dans la transaction métier : on laisse les vrais workers faire leur
      // tick (Outbox PUIS Webhook, exactement la chaîne réelle), jamais un appel direct au service
      // de livraison ni au handler.
      let delivered = false;
      for (let attempt = 0; attempt < 20 && !delivered; attempt += 1) {
        await outboxWorker.tick();
        await webhookWorker.tick();
        const deliveries = await prisma.webhookDelivery.findMany({ where: { organizationId: orgAId, subscriptionId: webhook.subscription.id } });
        delivered = deliveries.some((d) => d.status === "SUCCEEDED");
        if (!delivered) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(delivered).toBe(true);
      expect(receivedRequests.length).toBeGreaterThanOrEqual(1);

      const received = receivedRequests[receivedRequests.length - 1]!;
      const timestamp = received.headers["x-tenderos-timestamp"];
      const signature = received.headers["x-tenderos-signature"];
      expect(timestamp).toBeDefined();
      expect(signature).toBeDefined();

      // Vérification HMAC INDÉPENDANTE (mission §28/§103) — reproduit exactement l'algorithme
      // documenté, sans réutiliser le code de production.
      const expectedSignature = createHmac("sha256", webhook.secret).update(`${timestamp}.${received.rawBody}`, "utf8").digest("hex");
      expect(signature).toBe(expectedSignature);

      const payload = JSON.parse(received.rawBody) as { type: string; data: { tenderId: string } };
      expect(payload.type).toBe("tender.created");
    } finally {
      testServer.close();
      delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    }
  }, 30000);

  it("BLOQUANT — mission §104 : falsifier le corps après signature invalide la vérification indépendante", async () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: "evt_1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");

    const tamperedBody = JSON.stringify({ id: "evt_2" });
    const recomputed = createHmac("sha256", secret).update(`${timestamp}.${tamperedBody}`, "utf8").digest("hex");
    expect(recomputed).not.toBe(signature);
  });

  it("BLOQUANT — un endpoint qui répond 500 passe en RETRYING (jamais DEAD immédiatement), mission §105", async () => {
    let testServer!: Server;
    const port = await new Promise<number>((resolve) => {
      testServer = createServer((req, res) => {
        req.resume();
        res.writeHead(500);
        res.end();
      });
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "true";
    try {
      const webhookRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ endpointUrl: `http://127.0.0.1:${port}/hook`, events: ["tender.created"] }) });
      expect(webhookRes.status).toBe(201);
      const webhook = (await webhookRes.json()) as { subscription: { id: string } };

      const testEventRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks/${webhook.subscription.id}/test`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(testEventRes.status).toBe(201);

      await webhookWorker.tick();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const deliveries = await prisma.webhookDelivery.findMany({ where: { organizationId: orgAId, subscriptionId: webhook.subscription.id } });
      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      expect(deliveries[0]!.status).toBe("RETRYING");
      expect(deliveries[0]!.attemptCount).toBe(1);
      expect(deliveries[0]!.nextAvailableAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      testServer.close();
      delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    }
  }, 20000);

  it("BLOQUANT — audit Codex INT-P1-01 : une redirection HTTP vers une cible interne/de métadonnées cloud n'est JAMAIS suivie, la delivery passe DEAD (non-retryable)", async () => {
    let redirectServer!: Server;
    let redirectRequestCount = 0;
    const redirectPort = await new Promise<number>((resolve) => {
      redirectServer = createServer((req, res) => {
        redirectRequestCount += 1;
        req.resume();
        // Un endpoint "public" contrôlé par un tiers pourrait rediriger vers une cible interdite —
        // TenderOS ne doit JAMAIS suivre cette redirection, quelle que soit sa cible.
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      });
      redirectServer.listen(0, "127.0.0.1", () => {
        const addr = redirectServer.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "true";
    try {
      const webhookRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ endpointUrl: `http://127.0.0.1:${redirectPort}/hook`, events: ["tender.created"] }),
      });
      expect(webhookRes.status).toBe(201);
      const webhook = (await webhookRes.json()) as { subscription: { id: string } };

      const testEventRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks/${webhook.subscription.id}/test`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(testEventRes.status).toBe(201);

      let settled = false;
      for (let attempt = 0; attempt < 20 && !settled; attempt += 1) {
        await webhookWorker.tick();
        const deliveries = await prisma.webhookDelivery.findMany({ where: { organizationId: orgAId, subscriptionId: webhook.subscription.id } });
        settled = deliveries.some((d) => d.status !== "PENDING" && d.status !== "DELIVERING");
        if (!settled) await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const deliveries = await prisma.webhookDelivery.findMany({ where: { organizationId: orgAId, subscriptionId: webhook.subscription.id } });
      expect(deliveries).toHaveLength(1);
      // Jamais suivi, jamais retenté indéfiniment (mission §31/§95) — DEAD dès la première tentative,
      // jamais RETRYING (contrairement au 500 ci-dessus, qui EST retryable). `redirect: "manual"`
      // laisse le vrai statut 3xx lisible (jamais un `opaqueredirect` opaque sous Node/undici),
      // classé non-retryable par la policy existante exactement comme un 4xx.
      expect(deliveries[0]!.status).toBe("DEAD");
      expect(deliveries[0]!.attemptCount).toBe(1);
      expect(deliveries[0]!.httpStatus).toBe(302);
      // La redirection n'a jamais été suivie : un seul appel au serveur de test (celui qui répond
      // 302), aucune tentative de connexion vers la cible de la redirection.
      expect(redirectRequestCount).toBe(1);
    } finally {
      redirectServer.close();
      delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    }
  }, 20000);

  it("BLOQUANT — disabled webhook ne reçoit aucune nouvelle delivery (mission §57/§112)", async () => {
    const webhookRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ endpointUrl: "https://example.com/disabled-hook", events: ["tender.created"] }) });
    expect(webhookRes.status).toBe(201);
    const webhook = (await webhookRes.json()) as { subscription: { id: string } };

    const disableRes = await fetch(`${baseUrl}/api/v1/integrations/webhooks/${webhook.subscription.id}/status`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ enabled: false }) });
    expect(disableRes.status).toBe(200);

    const clientA = await createClient(orgAId, ownerAUserId, `Client Disabled ${randomUUID()}`);
    await createTender(orgAId, clientA, ownerAUserId, `Disabled Webhook Tender ${randomUUID()}`);

    await webhookWorker.tick();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const deliveries = await prisma.webhookDelivery.findMany({ where: { organizationId: orgAId, subscriptionId: webhook.subscription.id } });
    expect(deliveries).toHaveLength(0);
  });
});
