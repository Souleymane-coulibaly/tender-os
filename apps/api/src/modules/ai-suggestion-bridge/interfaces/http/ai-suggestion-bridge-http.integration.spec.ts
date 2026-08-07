import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { AiSuggestionFieldSchemaRegistry } from "../../../ai-suggestion";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

/**
 * V2 Sprint 4 §12 — preuve réelle contre HTTP + PostgreSQL du bridge AiSuggestion → Tenders
 * (apply/conflits/IDOR), même motif que les autres suites `*-http.integration.spec.ts` de ce repo.
 * Les suggestions sont semées directement via Prisma (comme `ai-suggestion-http.integration.spec.ts`)
 * — seul le chemin d'APPLICATION (jamais de CREATE) est sous test ici.
 */
describe("AiSuggestion bridge — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;
  let clientAId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Bridge HTTP Test" }),
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

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function seedTenderFieldSuggestion(input: { organizationId: string; tenderId: string; fieldName: string; proposedValue: unknown }): Promise<string> {
    const id = randomUUID();
    await prisma.aiSuggestion.create({
      data: {
        id,
        organizationId: input.organizationId,
        entityType: "TENDER_FIELD",
        fieldName: input.fieldName,
        parentTenderId: input.tenderId,
        proposedValue: input.proposedValue as never,
        confidence: 0.8,
        status: "PENDING",
        createdByProcess: "test.bridge-http-integration",
      },
    });
    return id;
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

    // Le mapping Finding → AiSuggestion (analysis) enregistre déjà les schémas des champs qu'il
    // produit — "description" n'en fait pas partie (mission §9 : seuls les champs date le sont).
    // Un vrai second producteur enregistrerait le sien à son propre bootstrap ; ce test simule ce
    // geste pour "description", exactement comme `ai-suggestion-http.integration.spec.ts` le fait
    // pour TENDER_LOT.title.
    moduleRef.get(AiSuggestionFieldSchemaRegistry).register("TENDER_FIELD", "description", z.string().min(1).max(4000));

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Bridge Org A HTTP", slug: `bridge-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Bridge Org B HTTP", slug: `bridge-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`bridge-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`bridge-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    const clientA = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client Bridge HTTP A", nameNormalized: "client bridge http a", status: "ACTIVE", createdBy: ownerA.userId },
    });
    clientAId = clientA.id;
  }, 60000);

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
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
  }, 60000);

  it("applies a suggestion directly onto an empty field and accepts it", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — vide", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "Description proposée par l'IA." });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ACCEPTED");

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tender.description).toBe("Description proposée par l'IA.");
  });

  it("requires an explicit conflictResolution when the target already has a value (409)", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId: orgAId,
        clientAccountId: clientAId,
        title: "Tender Bridge A — déjà rempli",
        description: "Description déjà saisie par l'utilisateur.",
        status: "DRAFT",
        tags: [],
        createdBy: ownerAUserId,
      },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "Description proposée par l'IA." });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AI_SUGGESTION_TARGET_CONFLICT");

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tender.description).toBe("Description déjà saisie par l'utilisateur.");
  });

  it("REPLACE overwrites the current value and accepts the suggestion", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — replace", description: "Ancienne description.", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "Description proposée par l'IA." });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ conflictResolution: "REPLACE" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ACCEPTED");

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tender.description).toBe("Description proposée par l'IA.");
  });

  it("KEEP_CURRENT rejects the suggestion and leaves the Tender untouched", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — keep", description: "Description conservée.", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "Description proposée par l'IA." });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ conflictResolution: "KEEP_CURRENT" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("REJECTED");

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tender.description).toBe("Description conservée.");
  });

  it("MERGE combines current and proposed text and reports MODIFIED", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — merge", description: "Description existante.", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "Complément proposé par l'IA." });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ conflictResolution: "MERGE" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("MODIFIED");

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tender.description).toBe("Description existante.\n\nComplément proposé par l'IA.");
  });

  it("mission §4 — a suggestion from another organization is not found (404, anti-enumeration)", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — IDOR", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "x" });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId), body: JSON.stringify({}) });
    expect(res.status).toBe(404);
  });

  it("refuses an unsupported entityType with 422, not a raw 500", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — unsupported", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = randomUUID();
    await prisma.aiSuggestion.create({
      data: {
        id: suggestionId,
        organizationId: orgAId,
        entityType: "TENDER_LOT",
        entityId: randomUUID(),
        fieldName: "title",
        parentTenderId: tenderId,
        proposedValue: "x" as never,
        confidence: 0.5,
        status: "PENDING",
        createdByProcess: "test.bridge-http-integration",
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AI_SUGGESTION_BRIDGE_UNSUPPORTED_ENTITY_TYPE");
  });

  it("lists a tender's suggestions through the bridge route, scoped to the owning organization", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — list", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: "x" });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/analysis/suggestions`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.some((s) => s.id === suggestionId)).toBe(true);

    // Le filtre `(organizationId, parentTenderId)` de ListAiSuggestionsUseCase exclut déjà toute
    // suggestion d'une autre organisation — jamais une fuite de données, mais une liste VIDE plutôt
    // qu'un 404 (cette route ne vérifie pas séparément l'existence du Tender lui-même, à la
    // différence de GET /ai-suggestions/:id qui charge la suggestion puis vérifie sa cible).
    const crossOrgRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/analysis/suggestions`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgRes.status).toBe(200);
    const crossOrgList = (await crossOrgRes.json()) as Array<{ id: string }>;
    expect(crossOrgList).toHaveLength(0);
  });

  // Audit Codex P1-001 (round 4 — atomicité totale) — preuve de bout en bout, via le chemin
  // HTTP+PostgreSQL réel (aucun hook de test, aucun code de production modifié pour l'occasion) :
  // un scénario authentique où l'écriture métier (Tender.description) réussit PUIS où la
  // finalisation de la suggestion (validation Zod dans ModifyAiSuggestionUseCase, plus stricte que
  // le domaine Tender qui n'impose aucune limite de longueur) échoue — les deux DOIVENT être
  // annulés ensemble, jamais l'un sans l'autre.
  it("audit Codex P1-001 (round 4) — a business write that succeeds but a finalize that fails afterwards rolls back BOTH together: never an orphaned Tender write, never a suggestion stuck in APPLYING", async () => {
    const tenderId = randomUUID();
    const originalDescription = "A".repeat(3980);
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId: orgAId,
        clientAccountId: clientAId,
        title: "Tender Bridge A — rollback total P1-001",
        description: originalDescription,
        status: "DRAFT",
        tags: [],
        createdBy: ownerAUserId,
      },
    });
    // Le schéma enregistré pour TENDER_FIELD/description (voir beforeAll) plafonne à 4000
    // caractères — le domaine Tender lui-même n'impose AUCUNE limite : le MERGE ci-dessous produit
    // un texte de 4012 caractères, que `adapter.applyValue` écrit avec succès dans `tenders`, mais
    // que la revalidation Zod de `ModifyAiSuggestionUseCase` (appelée APRÈS cette écriture, dans la
    // même transaction) rejette.
    const proposedAddition = "B".repeat(30);
    const suggestionId = await seedTenderFieldSuggestion({ organizationId: orgAId, tenderId, fieldName: "description", proposedValue: proposedAddition });

    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/apply`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ conflictResolution: "MERGE" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AI_SUGGESTION_INVALID_PROPOSED_VALUE");

    // La preuve : le Tender n'a JAMAIS conservé le texte fusionné (4012 caractères) que
    // `adapter.applyValue` avait pourtant écrit avec succès — la transaction entière a été annulée.
    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tender.description).toBe(originalDescription);
    expect(tender.description?.length).toBe(3980);

    // Et la suggestion n'est JAMAIS restée bloquée en APPLYING (round 1/3 : c'était le risque
    // résiduel documenté) — le rollback couvre aussi sa propre réservation.
    const suggestion = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    expect(suggestion.status).toBe("PENDING");
    expect(suggestion.appliedValue).toBeNull();
  });

  it("map-suggestions is a safe no-op when no consolidation has ever succeeded for the tender", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Bridge A — no analysis", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/analysis/map-suggestions`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysisVersion: number | undefined; createdCount: number };
    expect(body.analysisVersion).toBeUndefined();
    expect(body.createdCount).toBe(0);
  });
});
