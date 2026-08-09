import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const PREVIOUS_MAX_AI_CALLS_PER_TENDER_PER_DAY = process.env.CHAT_MAX_AI_CALLS_PER_TENDER_PER_DAY;

/**
 * V2 Sprint 9 (Chat IA conversationnel) — preuve réelle contre HTTP + PostgreSQL (NestJS) : flux
 * principal (Conversation), isolation multi-tenant, et surtout ClientAccess AU SEIN de la MÊME
 * organisation (mission — deux tests BLOQUANTS explicitement requis : same-org cross-client via
 * Chat, et anti-IDOR direct sur l'API Conversation/Message).
 *
 * `POST .../messages` avec un appel IA RÉEL n'est volontairement PAS exercé ici — aucune
 * dépendance réseau/clé API dans cette suite ; la logique de génération (garde PENDING, validation
 * de citations, échec gracieux) est déjà couverte par `send-message.use-case.spec.ts` avec un
 * `FakeAIProvider`. En revanche le garde-fou volume IA (correctif audit Codex P1) s'applique AVANT
 * tout appel provider (`SendMessageUseCase` Phase A) : il EST exerçable ici, avec un plafond abaissé
 * à 2 via `CHAT_MAX_AI_CALLS_PER_TENDER_PER_DAY` pour tout ce fichier (restauré en `afterAll`,
 * aucun autre test ici n'appelle `POST .../messages`, donc aucune interférence).
 */
describe("Chat IA conversationnel — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenKarim: string;
  let ownerAUserId: string;
  let karimUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Chat HTTP Test" }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<void> {
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy },
    });
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClientAndTender(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Chat ${suffix}`, nameNormalized: `client chat ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Chat HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
  }

  beforeAll(async () => {
    process.env.CHAT_MAX_AI_CALLS_PER_TENDER_PER_DAY = "2";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Chat Org A HTTP", slug: `chat-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Chat Org B HTTP", slug: `chat-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`chat-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`chat-owner-b-${randomUUID()}@smoke.test`);
    const karim = await registerAndLogin(`chat-karim-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, karim.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenKarim = karim.token;
    ownerAUserId = ownerA.userId;
    karimUserId = karim.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: karim.userId, role: OrganizationRole.BidManager });
  }, 60000);

  afterAll(async () => {
    await prisma.messageCitation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.message.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.conversation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
    if (PREVIOUS_MAX_AI_CALLS_PER_TENDER_PER_DAY === undefined) {
      delete process.env.CHAT_MAX_AI_CALLS_PER_TENDER_PER_DAY;
    } else {
      process.env.CHAT_MAX_AI_CALLS_PER_TENDER_PER_DAY = PREVIOUS_MAX_AI_CALLS_PER_TENDER_PER_DAY;
    }
  }, 60000);

  it("main flow: create a conversation, list it, get it, archive it — always scoped to its own Tender", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, {
      method: "POST",
      headers: authHeaders(tokenKarim, orgAId),
      body: JSON.stringify({ title: "Questions sur le DCE" }),
    });
    expect(createRes.status).toBe(201);
    const conversation = (await createRes.json()) as { id: string; tenderId: string; clientAccountId: string; title: string };
    expect(conversation.tenderId).toBe(tenderId);
    expect(conversation.clientAccountId).toBe(clientAccountId);
    expect(conversation.title).toBe("Questions sur le DCE");

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(listRes.status).toBe(200);
    const conversations = (await listRes.json()) as { id: string }[];
    expect(conversations.map((c) => c.id)).toContain(conversation.id);

    const getRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations/${conversation.id}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(getRes.status).toBe(200);

    const archiveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations/${conversation.id}/archive`, { method: "POST", headers: authHeaders(tokenKarim, orgAId) });
    expect(archiveRes.status).toBe(200);
    expect(((await archiveRes.json()) as { archivedAt: string | null }).archivedAt).toBeTruthy();

    const listAfterArchiveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, { headers: authHeaders(tokenKarim, orgAId) });
    const afterArchive = (await listAfterArchiveRes.json()) as { id: string }[];
    expect(afterArchive.map((c) => c.id)).not.toContain(conversation.id);
  });

  it("a VIEWER-tier client role (ReadChat only) can read conversations but is forbidden from creating one (UseChat required)", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const viewer = await registerAndLogin(`chat-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    await addMembership({ organizationId: orgAId, userId: viewer.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: viewer.userId, role: "VIEWER", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, { headers: authHeaders(viewer.token, orgAId) });
    expect(listRes.status).toBe(200);

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, { method: "POST", headers: authHeaders(viewer.token, orgAId), body: JSON.stringify({}) });
    expect(createRes.status).toBe(403);
  });

  it("BLOCKING — never leaks a conversation of a DIFFERENT client of the SAME organization, even for an actor with a real (but unrelated) client assignment", async () => {
    const clientA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const jean = await registerAndLogin(`chat-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    // Jean n'a d'accès QU'au Client B — jamais au Client A.
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    // Alice (Owner) crée une conversation sur le Tender du Client A.
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/conversations`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Conversation confidentielle Client A" }),
    });
    expect(createRes.status).toBe(201);
    const conversation = (await createRes.json()) as { id: string };

    // Jean, same-org mais SANS accès à ce client précis, ne doit RIEN voir de ce Tender via Chat —
    // ni la liste, ni la conversation directement par son id (anti-IDOR), ni ses messages.
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/conversations`, { headers: authHeaders(jean.token, orgAId) });
    expect(listRes.status).toBe(404);

    const getRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/conversations/${conversation.id}`, { headers: authHeaders(jean.token, orgAId) });
    expect(getRes.status).toBe(404);

    const messagesRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/conversations/${conversation.id}/messages`, { headers: authHeaders(jean.token, orgAId) });
    expect(messagesRes.status).toBe(404);

    // Jean ne peut pas non plus créer de conversation sur ce Tender.
    const createByJeanRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/conversations`, { method: "POST", headers: authHeaders(jean.token, orgAId), body: JSON.stringify({}) });
    expect(createByJeanRes.status).toBe(404);
  });

  it("BLOCKING — a DIFFERENT organization never sees a conversation, even by guessing its exact UUID (cross-org anti-IDOR)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    const conversation = (await createRes.json()) as { id: string };

    const crossOrgListRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgListRes.status).toBe(404);

    const crossOrgGetRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations/${conversation.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgGetRes.status).toBe(404);
  });

  it("a conversation created for lotId=X is rejected if that lot does not belong to the Tender (anti-IDOR on lotId)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ lotId: randomUUID() }),
    });
    expect(createRes.status).toBe(404);
  });

  // Correctif audit Codex P1 (garde-fou volume IA, décision utilisateur) — plafond abaissé à 2
  // pour ce fichier (voir `beforeAll`). Le garde-fou s'applique dans `SendMessageUseCase` Phase A,
  // AVANT toute résolution/appel du provider IA : exerçable ici sans clé API réelle.
  it("BLOQUANT (garde-fou volume IA) — refuses POST .../messages with 429 CHAT_RATE_LIMIT_REACHED once the Tender's daily cap of billable AI messages is reached, and never before", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const conversation = await prisma.conversation.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, createdByUserId: ownerAUserId } });

    // Sème directement 2 messages ASSISTANT "facturables" (COMPLETED, model renseigné) — le
    // plafond de ce fichier est 2 (voir `beforeAll`).
    await prisma.message.createMany({
      data: [0, 1].map(() => ({
        id: randomUUID(),
        organizationId: orgAId,
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: "réponse précédente",
        status: "COMPLETED",
        model: "gpt-4o-mini",
      })),
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: "Une question de plus ?" }),
    });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CHAT_RATE_LIMIT_REACHED");

    // La garde s'applique AVANT toute écriture — aucun nouveau message USER/ASSISTANT créé au-delà
    // des 2 semés ci-dessus.
    const messageCount = await prisma.message.count({ where: { organizationId: orgAId, conversationId: conversation.id } });
    expect(messageCount).toBe(2);
  });
});
