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

const PDF_BYTES = Buffer.from("%PDF-1.7 fake content for cockpit HTTP tests");

/**
 * Mission Sprint 8A.2 — Cockpit Bid Manager : preuve HTTP réelle + PostgreSQL réel que
 * `GetTenderCockpitUseCase` compose bien les 9 modules agrégés à travers le graphe NestJS complet
 * (`Test.createTestingModule({ imports: [AppModule] })` — un échec de `compile()` ferait échouer ce
 * test avant même le premier `it`, prouvant l'absence de cycle/de provider manquant), et que
 * l'étape courante/la prochaine action progressent réellement à mesure que le dossier avance.
 */
describe("Cockpit — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const clientBId = randomUUID();
  const tenderAId = randomUUID();
  const tenderBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Cockpit HTTP Test", termsAccepted: true }),
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

  // Jamais de `Content-Type` fixe ici : une requête multipart (import DCE) laisse `fetch` poser
  // lui-même l'en-tête avec la bonne frontière — un `Content-Type: application/json` figé le
  // casserait silencieusement (400, jamais un succès).
  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  type CockpitResponse = {
    tenderId: string;
    currentStep: string;
    nextAction: string;
    modules: { key: string; status: string; count?: number; total?: number }[];
    alerts: { level: string; code: string }[];
  };

  async function getCockpit(tenderId: string, token: string, organizationId: string): Promise<{ status: number; body: CockpitResponse }> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/cockpit`, { headers: authHeaders(token, organizationId) });
    return { status: res.status, body: (await res.json()) as CockpitResponse };
  }

  function moduleStatus(body: CockpitResponse, key: string): string | undefined {
    return body.modules.find((m) => m.key === key)?.status;
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Cockpit Org A HTTP", slug: `cockpit-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Cockpit Org B HTTP", slug: `cockpit-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`cockpit-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`cockpit-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client Cockpit A", nameNormalized: "client cockpit a", status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.clientAccount.create({ data: { id: clientBId, organizationId: orgBId, name: "Client Cockpit B", nameNormalized: "client cockpit b", status: "ACTIVE", createdBy: ownerB.userId } });
    await prisma.tender.create({ data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAId, title: "Tender Cockpit A — HTTP", status: "DRAFT", tags: [], createdBy: ownerA.userId } });
    await prisma.tender.create({ data: { id: tenderBId, organizationId: orgBId, clientAccountId: clientBId, title: "Tender Cockpit B — HTTP", status: "DRAFT", tags: [], createdBy: ownerB.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.dceDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.updateMany({ where: { organizationId: { in: [orgAId, orgBId] } }, data: { currentVersionId: null } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.deliverable.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 30000);

  it("reports DISCOVERY/INITIALIZE_DCE for a brand-new Tender, and the 9 deliverables auto-initialize at 0/9", async () => {
    const { status, body } = await getCockpit(tenderAId, tokenOwnerA, orgAId);
    expect(status).toBe(200);
    expect(body.tenderId).toBe(tenderAId);
    expect(body.currentStep).toBe("DISCOVERY");
    expect(body.nextAction).toBe("INITIALIZE_DCE");
    expect(moduleStatus(body, "DCE")).toBe("NOT_STARTED");
    expect(moduleStatus(body, "DELIVERABLES")).toBe("NOT_STARTED");
    const deliverables = body.modules.find((m) => m.key === "DELIVERABLES")!;
    expect(deliverables.total).toBe(9);
    expect(deliverables.count).toBe(0);
    expect(moduleStatus(body, "SIGNATURE")).toBe("NOT_APPLICABLE");
    expect(moduleStatus(body, "PACKAGE")).toBe("NOT_STARTED");
  });

  it("advances to IMPORT_DOCUMENTS once the DCE is initialized but still empty", async () => {
    const initRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(initRes.status).toBe(201);

    const { status, body } = await getCockpit(tenderAId, tokenOwnerA, orgAId);
    expect(status).toBe(200);
    expect(body.currentStep).toBe("DISCOVERY");
    expect(body.nextAction).toBe("IMPORT_DOCUMENTS");
    expect(moduleStatus(body, "DCE")).toBe("IN_PROGRESS");
  });

  it("moves to the ANALYSIS step once a document is actually imported into the DCE", async () => {
    const form = new FormData();
    form.append("files", new Blob([PDF_BYTES], { type: "application/pdf" }), "cctp.pdf");
    const importRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: form });
    expect(importRes.status).toBe(201);

    const { status, body } = await getCockpit(tenderAId, tokenOwnerA, orgAId);
    expect(status).toBe(200);
    expect(moduleStatus(body, "DCE")).toBe("DONE");
    expect(body.currentStep).toBe("ANALYSIS");
    expect(body.nextAction).toBe("RUN_ANALYSIS");
  });

  it("isolates the cockpit per tenant — Org B never sees Org A's Tender cockpit (404, never 403, anti-enumeration)", async () => {
    const { status } = await getCockpit(tenderAId, tokenOwnerB, orgBId);
    expect(status).toBe(404);
  });

  it("Org B's own, untouched Tender independently reports DISCOVERY — no cross-tenant leakage of state", async () => {
    const { status, body } = await getCockpit(tenderBId, tokenOwnerB, orgBId);
    expect(status).toBe(200);
    expect(body.currentStep).toBe("DISCOVERY");
    expect(moduleStatus(body, "DCE")).toBe("NOT_STARTED");
  });

  it("rejects a request with no membership on the target organization — 404, never 403 (anti-enumeration, OrganizationMembershipGuard)", async () => {
    const outsider = await registerAndLogin(`cockpit-outsider-${randomUUID()}@smoke.test`);
    userIds.push(outsider.userId);
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/cockpit`, { headers: authHeaders(outsider.token, orgAId) });
    expect(res.status).toBe(404);
  });
});
