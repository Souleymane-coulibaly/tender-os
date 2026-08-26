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
import { buildMinimalPdf } from "../../test-support/pdf-fixture-builder";

type ExtractionSummary = { documentId: string; status: string; attemptCount: number; chunkCount?: number };
type AnalysisJob = { id: string; status: string; scope: string };

/**
 * Preuve réelle contre HTTP + PostgreSQL (mission Sprint 8A.2, correction bug #2/#1/#4 — "aucun
 * document, même importé via DCE, ne pouvait jamais être analysé car rien ne déclenchait jamais
 * l'extraction") — jamais un appel manuel à `POST .../extraction` dans ces tests : c'est
 * exactement le point à prouver, que le déclenchement système suffit désormais seul.
 */
describe("Auto-trigger extraction — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenAdminA: string;
  let tokenAdminB: string;

  let tenderAId: string;
  let tenderBId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Auto-Trigger HTTP Test", termsAccepted: true }),
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

  async function addMembership(input: {
    organizationId: string;
    userId: string;
    role: (typeof OrganizationRole)[keyof typeof OrganizationRole];
  }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        occurredAt: new Date(),
      }),
    );
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  function extractionUrl(tenderId: string, documentId: string): string {
    return `${baseUrl}/api/v1/tenders/${tenderId}/dce/documents/${documentId}/extraction`;
  }

  async function getExtraction(tenderId: string, documentId: string, token: string, organizationId: string) {
    const res = await fetch(extractionUrl(tenderId, documentId), { headers: authHeaders(token, organizationId) });
    return { status: res.status, body: (await res.json()) as ExtractionSummary };
  }

  async function waitForTerminalStatus(
    tenderId: string,
    documentId: string,
    token: string,
    organizationId: string,
    timeoutMs = 20000,
  ): Promise<ExtractionSummary> {
    const terminal = new Set(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "NOT_PROCESSABLE"]);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { status, body } = await getExtraction(tenderId, documentId, token, organizationId);
      if (status === 200 && terminal.has(body.status)) {
        return body;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Extraction for document ${documentId} never reached a terminal status (auto-trigger did not fire?) ` +
            `— last seen: HTTP ${status} / ${JSON.stringify(body)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async function importPdfViaDce(input: {
    tenderId: string;
    token: string;
    organizationId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<string> {
    await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(input.token, input.organizationId) },
    });
    const form = new FormData();
    form.append("files", new Blob([input.buffer], { type: "application/pdf" }), input.filename);
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: { documentId: string }[] };
    expect(body.accepted).toHaveLength(1);
    return body.accepted[0]!.documentId;
  }

  async function uploadStandaloneDocument(input: {
    token: string;
    organizationId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([input.buffer], { type: "application/pdf" }), input.filename);
    form.append("title", input.filename);
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    const res = await fetch(`${baseUrl}/api/v1/documents`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  async function attachToTender(input: {
    documentId: string;
    tenderId: string;
    token: string;
    organizationId: string;
  }): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/documents/${input.documentId}/tenders/${input.tenderId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(input.token, input.organizationId) },
    });
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

    await prisma.organization.create({
      data: { id: orgAId, name: "Auto-Trigger Org A", slug: `auto-trigger-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.organization.create({
      data: { id: orgBId, name: "Auto-Trigger Org B", slug: `auto-trigger-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    // Checkpoint TENDEROS-2.1-P2.3-E12.1 — même cause que `extraction-http.integration.spec.ts` :
    // les routes DCE exercées ici sont gatées par `EntitlementService` depuis le Checkpoint E1.1
    // (FINDING 1) et ce spec n'avait jamais été mis à jour, contrairement à `dce-http`. Le 402
    // observé était la réponse CORRECTE du produit, pas une régression — la précondition commerciale
    // est donc créée réellement, jamais le gate contourné. La preuve du REFUS sans entitlement vit
    // dans `extraction-http.integration.spec.ts` (test dédié "gate commercial"), pas dupliquée ici.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const adminA = await registerAndLogin(`auto-trigger-admin-a-${randomUUID()}@smoke.test`);
    const adminB = await registerAndLogin(`auto-trigger-admin-b-${randomUUID()}@smoke.test`);
    userIds.push(adminA.userId, adminB.userId);
    tokenAdminA = adminA.token;
    tokenAdminB = adminB.token;

    await addMembership({ organizationId: orgAId, userId: adminA.userId, role: OrganizationRole.OrganizationAdmin });
    await addMembership({ organizationId: orgBId, userId: adminB.userId, role: OrganizationRole.OrganizationAdmin });

    const clientAccountA = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: adminA.userId },
    });
    const clientAccountB = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgBId, name: "Client B", nameNormalized: "client b", status: "ACTIVE", createdBy: adminB.userId },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAccountA.id, title: "Tender A — Auto-Trigger HTTP", status: "DRAFT", tags: [], createdBy: adminA.userId },
    });
    tenderBId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderBId, organizationId: orgBId, clientAccountId: clientAccountB.id, title: "Tender B — Auto-Trigger HTTP", status: "DRAFT", tags: [], createdBy: adminB.userId },
    });
  }, 60000);

  afterAll(async () => {
    // Checkpoint TENDEROS-2.1-P2.3-E12.2 — l'application est fermée AVANT le nettoyage, jamais après.
    // Ce spec déclenche un pipeline d'extraction/analyse ASYNCHRONE : tant que l'app tourne, ses
    // dispatchers de fond continuent d'écrire de vrais `OutboxEvent` pour ces organisations. L'ordre
    // précédent (purge de l'Outbox en tête, `organization.deleteMany` ~20 requêtes plus loin)
    // laissait une fenêtre pendant laquelle un évènement pouvait être réécrit, faisant échouer la
    // suppression finale sur `outbox_events_organization_id_fkey` — observé au FULL RUN #2, jamais
    // au RUN #1 : une course, donc invisible tant qu'on ne rejoue pas la suite deux fois de suite.
    // Fermer l'app d'abord supprime la course à sa source, sans `sleep` ni retry (Prisma se
    // reconnecte paresseusement pour les requêtes de nettoyage ci-dessous).
    await app.close();
    // Audit Codex P1-4 — RoutingPolicyBridgeModule est câblé dans l'app réelle : une décision de
    // routage durable est créée pour chaque job traité (même sans provider IA configuré, l'échec
    // AI_PROVIDER_NOT_CONFIGURED intervient après la persistance de la décision), jamais nettoyée
    // par les suppressions "métier" ci-dessous (même motif que analysis-http.integration.spec.ts).
    await prisma.routingDecision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // Même motif que routingDecision ci-dessus — le dispatch d'analyse en arrière-plan continue
    // d'écrire des évènements Outbox après que la réponse HTTP soit revenue, jamais nettoyés par
    // les suppressions "métier" ci-dessous.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentBusinessAnalysis.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisAttempt.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.extractionChunk.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.extractionAttempt.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentExtraction.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTenderAssociation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dceDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.updateMany({ where: { organizationId: { in: [orgAId, orgBId] } }, data: { currentVersionId: null } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  }, 30000);

  it("a document imported via DCE reaches a terminal extraction status with zero manual trigger", async () => {
    const documentId = await importPdfViaDce({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`DCE import auto-trigger ${randomUUID()}.`]),
      filename: "cctp.pdf",
    });

    const final = await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);
    expect(final.status).toBe("SUCCEEDED");
    expect(final.chunkCount).toBeGreaterThan(0);
  }, 25000);

  it("a document merely attached to the Tender (never DCE-imported) also becomes analyzable — auto-creates the missing Dce/DceDocument link", async () => {
    const documentId = await uploadStandaloneDocument({
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Tender-attached-only auto-trigger ${randomUUID()}.`]),
      filename: "attached-only.pdf",
    });

    const attachRes = await attachToTender({ documentId, tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId });
    expect(attachRes.status).toBe(201);

    // Avant Sprint 8A.2 : GET .../extraction renvoyait 404 pour toujours (aucun DceDocument,
    // jamais créé pour un document seulement attaché) — preuve directe de la correction.
    const final = await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);
    expect(final.status).toBe("SUCCEEDED");

    const link = await prisma.dceDocument.findFirst({ where: { organizationId: orgAId, documentId } });
    expect(link).not.toBeNull();
    expect(link?.category).toBe("OTHER");

    // La conséquence business réelle du bug #2 : une analyse documentaire peut désormais être
    // lancée sans jamais heurter DocumentExtractionNotFoundError/ExtractionNotReadyForAnalysisError.
    const analysisRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/documents/${documentId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(analysisRes.status).toBe(202);
    const job = (await analysisRes.json()) as AnalysisJob;
    expect(job.scope).toBe("DOCUMENT");
  }, 25000);

  it("is idempotent: attaching an already DCE-imported document to the same tender never creates a second Dce/DceDocument/DocumentExtraction", async () => {
    const documentId = await importPdfViaDce({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Idempotency double-link ${randomUUID()}.`]),
      filename: "idempotent.pdf",
    });
    await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);

    const dceBefore = await prisma.dce.findMany({ where: { organizationId: orgAId, tenderId: tenderAId } });
    const linksBefore = await prisma.dceDocument.count({ where: { organizationId: orgAId, documentId } });
    const extractionsBefore = await prisma.documentExtraction.count({ where: { organizationId: orgAId, documentId } });

    // Un document déjà importé via DCE n'a jamais de DocumentTenderAssociation (tables
    // distinctes, cause racine du bug #2) — l'attacher explicitement est un second déclenchement
    // légitime du même document, qui doit retrouver l'existant sans rien dupliquer.
    const attachRes = await attachToTender({ documentId, tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId });
    expect(attachRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const dceAfter = await prisma.dce.findMany({ where: { organizationId: orgAId, tenderId: tenderAId } });
    const linksAfter = await prisma.dceDocument.count({ where: { organizationId: orgAId, documentId } });
    const extractionsAfter = await prisma.documentExtraction.count({ where: { organizationId: orgAId, documentId } });

    expect(dceAfter.length).toBe(dceBefore.length);
    expect(linksAfter).toBe(linksBefore);
    expect(extractionsAfter).toBe(extractionsBefore);
  }, 25000);

  it("never links or extracts a document belonging to a foreign organization", async () => {
    const documentIdOrgB = await uploadStandaloneDocument({
      token: tokenAdminB,
      organizationId: orgBId,
      buffer: buildMinimalPdf([`Foreign org document ${randomUUID()}.`]),
      filename: "foreign.pdf",
    });

    const crossOrgAttach = await attachToTender({
      documentId: documentIdOrgB,
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
    });
    expect(crossOrgAttach.status).toBe(404);

    const link = await prisma.dceDocument.findFirst({ where: { documentId: documentIdOrgB } });
    expect(link).toBeNull();
  });
});
