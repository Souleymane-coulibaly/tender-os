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
import { CONNECTOR_PROVIDER_ADAPTERS } from "../../application/ports/connector-provider-adapter";
import { ConnectorProvider } from "../../domain/enums";
import { FakeConnectorProviderAdapter } from "../../test-support/fake-connector-provider-adapter";

/**
 * V2 Sprint 19 (Connecteurs Microsoft 365 & Google Workspace) — preuve réelle HTTP + PostgreSQL
 * (NestJS), même motif que les sprints précédents : `CONNECTOR_PROVIDER_ADAPTERS` est substitué par
 * `FakeConnectorProviderAdapter` (mission §81/§104 "OAuth contract tested" — cette suite prouve le
 * comportement TenderOS autour des tokens/fichiers, jamais la conformité au protocole Graph/Google
 * réel, testée séparément et unitairement contre les adapters réels). Flux principal (connexion →
 * import → export → calendrier), puis les scénarios BLOQUANTS de la mission.
 */
describe("Connecteurs (connectors) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let fakeMicrosoft: FakeConnectorProviderAdapter;
  let fakeGoogle: FakeConnectorProviderAdapter;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenKarim: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;
  let karimUserId: string;
  let ownerBUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "Connectors HTTP Test" }) });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }));
  }

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<void> {
    await prisma.clientAssignment.create({ data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy } });
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClientAndTender(input: { organizationId: string; userId: string; submissionDeadline?: Date }): Promise<{ clientAccountId: string; tenderId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({ data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Connectors ${suffix}`, nameNormalized: `client connectors ${suffix}`, status: "ACTIVE", createdBy: input.userId } });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Connectors HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId, ...(input.submissionDeadline ? { submissionDeadline: input.submissionDeadline } : {}) },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
  }

  async function uploadDocument(input: { token: string; organizationId: string; filename: string }): Promise<{ documentId: string; documentVersionId: string }> {
    const form = new FormData();
    form.append("title", input.filename);
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("file", new Blob([Buffer.from("contenu réel du document")], { type: "application/pdf" }), input.filename);
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${input.token}`, "X-Organization-Id": input.organizationId }, body: form });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; currentVersion: { id: string } };
    return { documentId: body.id, documentVersionId: body.currentVersion.id };
  }

  async function attachDocumentToTender(input: { token: string; organizationId: string; documentId: string; tenderId: string }): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/documents/${input.documentId}/tenders/${input.tenderId}`, { method: "POST", headers: authHeaders(input.token, input.organizationId) });
    expect(res.status).toBe(201);
  }

  /** Nettoie toute connexion PENDING/ACTIVE/REAUTH_REQUIRED existante pour ce (org, provider) —
   *  l'index partiel `external_connections_org_provider_active_uidx` n'autorise qu'une seule
   *  connexion "en vie" à la fois : sans ce nettoyage, un test précédent qui n'a pas explicitement
   *  déconnecté sa propre connexion ferait échouer TOUS les tests suivants réutilisant le même
   *  provider (409), un motif de pollution inter-tests jamais acceptable dans cette suite. */
  async function ensureNoActiveConnection(organizationId: string, provider: string): Promise<void> {
    await prisma.externalConnection.deleteMany({ where: { organizationId, provider, status: { in: ["PENDING", "ACTIVE", "REAUTH_REQUIRED"] } } });
  }

  async function connectMicrosoft(input: { token: string; organizationId: string; name?: string; allowedClientAccountIds?: string[] }): Promise<string> {
    await ensureNoActiveConnection(input.organizationId, ConnectorProvider.Microsoft365);
    const initiateRes = await fetch(`${baseUrl}/api/v1/connectors`, { method: "POST", headers: authHeaders(input.token, input.organizationId), body: JSON.stringify({ provider: ConnectorProvider.Microsoft365, name: input.name ?? "Compte Microsoft principal", allowedClientAccountIds: input.allowedClientAccountIds }) });
    expect(initiateRes.status).toBe(201);
    const { authorizationUrl } = (await initiateRes.json()) as { authorizationUrl: string };
    const state = new URL(authorizationUrl).searchParams.get("state")!;

    const callbackRes = await fetch(`${baseUrl}/api/v1/connectors/oauth/microsoft-365/callback?state=${encodeURIComponent(state)}&code=fake-code-${randomUUID()}`, { redirect: "manual" });
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.get("location")).toContain("connectorConnected=1");

    const listRes = await fetch(`${baseUrl}/api/v1/connectors`, { headers: authHeaders(input.token, input.organizationId) });
    const connections = (await listRes.json()) as { id: string; provider: string; status: string }[];
    const created = connections.find((c) => c.provider === ConnectorProvider.Microsoft365 && c.status === "ACTIVE")!;
    return created.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONNECTOR_PROVIDER_ADAPTERS)
      .useFactory({
        factory: () => {
          fakeMicrosoft = new FakeConnectorProviderAdapter(ConnectorProvider.Microsoft365);
          fakeGoogle = new FakeConnectorProviderAdapter(ConnectorProvider.GoogleWorkspace);
          return new Map([
            [ConnectorProvider.Microsoft365, fakeMicrosoft],
            [ConnectorProvider.GoogleWorkspace, fakeGoogle],
          ]);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "string" ? address : address?.port}`;
    prisma = moduleRef.get(PrismaService);

    const ownerA = await registerAndLogin(`owner-a-${randomUUID()}@example.com`);
    const karim = await registerAndLogin(`karim-${randomUUID()}@example.com`);
    const ownerB = await registerAndLogin(`owner-b-${randomUUID()}@example.com`);
    ownerAUserId = ownerA.userId;
    tokenOwnerA = ownerA.token;
    karimUserId = karim.userId;
    tokenKarim = karim.token;
    ownerBUserId = ownerB.userId;
    tokenOwnerB = ownerB.token;
    userIds.push(ownerAUserId, karimUserId, ownerBUserId);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Org A Connectors", slug: `org-a-connectors-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Org B Connectors", slug: `org-b-connectors-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await addMembership({ organizationId: orgAId, userId: ownerAUserId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: karimUserId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgBId, userId: ownerBUserId, role: OrganizationRole.Owner });
  });

  afterAll(async () => {
    await prisma.calendarSyncedEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.syncConfiguration.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.oAuthFlowState.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.externalConnection.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTenderAssociation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it("main flow: initiate -> OAuth callback -> ACTIVE -> import -> export -> calendar event, all real HTTP", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId, submissionDeadline: new Date("2027-03-15T17:00:00Z") });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId });

    // Import.
    const remoteFileId = `remote-file-${randomUUID()}`;
    fakeMicrosoft.downloadedContent.set(remoteFileId, { buffer: Buffer.from("contenu SharePoint"), mimeType: "application/pdf", filename: "cctp.pdf" });
    const importRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/import`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ containerId: "fake-container", fileId: remoteFileId, mimeType: "application/pdf", clientAccountId, tenderId }),
    });
    expect(importRes.status).toBe(201);
    const imported = (await importRes.json()) as { id: string };

    const importedDoc = await prisma.document.findFirst({ where: { id: imported.id, organizationId: orgAId } });
    expect(importedDoc?.origin).toBe("IMPORTED");
    const association = await prisma.documentTenderAssociation.findFirst({ where: { organizationId: orgAId, documentId: imported.id, tenderId } });
    expect(association).not.toBeNull();

    // Export — un document distinct, uploadé via l'API normale puis exporté.
    const { documentId, documentVersionId } = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "memoire.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId, tenderId });
    const exportRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/export`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ containerId: "fake-container", folderId: "fake-folder", documentId, versionId: documentVersionId, clientAccountId }),
    });
    expect(exportRes.status).toBe(201);
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(1);
    expect(fakeMicrosoft.uploadedFiles[0]!.filename).toBe("memoire.pdf");

    // Calendrier — idempotent : un second appel renvoie le même événement, jamais un doublon.
    const calendarRes1 = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/calendar-events`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ tenderId }) });
    expect(calendarRes1.status).toBe(201);
    const event1 = (await calendarRes1.json()) as { externalEventId: string; alreadyExisted: boolean };
    expect(event1.alreadyExisted).toBe(false);

    const calendarRes2 = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/calendar-events`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ tenderId }) });
    const event2 = (await calendarRes2.json()) as { externalEventId: string; alreadyExisted: boolean };
    expect(event2.alreadyExisted).toBe(true);
    expect(event2.externalEventId).toBe(event1.externalEventId);
    expect(fakeMicrosoft.createdEvents).toHaveLength(1);

    // Déconnexion — révoque réellement les credentials.
    const disconnectRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}`, { method: "DELETE", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(disconnectRes.status).toBe(204);
    const afterDisconnect = await prisma.externalConnection.findFirst({ where: { id: connectionId } });
    expect(afterDisconnect?.status).toBe("REVOKED");
    expect(afterDisconnect?.encryptedAccessToken).toBeNull();
  });

  it("BLOQUANT — cross-tenant: organization B can neither see nor act on organization A's connection (404, never leaking existence)", async () => {
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Cross tenant test" });

    const getRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/browse`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(getRes.status).toBe(404);

    const disconnectRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}`, { method: "DELETE", headers: authHeaders(tokenOwnerB, orgBId) });
    expect(disconnectRes.status).toBe(404);
  });

  it("BLOQUANT — same-org cross-client: a connection restricted to Client A can never import/export into a Tender of Client B (mission §52)", async () => {
    const { clientAccountId: clientAId, tenderId: tenderAId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const { clientAccountId: clientBId, tenderId: tenderBId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Client-restricted", allowedClientAccountIds: [clientAId] });

    const remoteFileId = `remote-file-${randomUUID()}`;
    fakeMicrosoft.downloadedContent.set(remoteFileId, { buffer: Buffer.from("x"), mimeType: "application/pdf", filename: "x.pdf" });

    const blockedRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/import`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ containerId: "fake-container", fileId: remoteFileId, mimeType: "application/pdf", clientAccountId: clientBId, tenderId: tenderBId }),
    });
    expect(blockedRes.status).toBe(404);
    expect(((await blockedRes.json()) as { error: { code: string } }).error.code).toBe("EXTERNAL_CONNECTION_CLIENT_NOT_ALLOWED");

    const allowedRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/import`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ containerId: "fake-container", fileId: remoteFileId, mimeType: "application/pdf", clientAccountId: clientAId, tenderId: tenderAId }),
    });
    expect(allowedRes.status).toBe(201);
  });

  it("BLOQUANT — audit fix (P2): a client-restricted connection also blocks BROWSE (not just import/export) for a use-tier actor without the right clientAccountId; OWNER (Manage tier) is unaffected", async () => {
    const { clientAccountId: clientAId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const { clientAccountId: clientBId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Browse narrowing test", allowedClientAccountIds: [clientAId] });
    await assignClient({ organizationId: orgAId, clientAccountId: clientAId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    // Karim (CONTRIBUTOR, use-tier, jamais Manage) navigue sans préciser de contexte client sur
    // une connexion restreinte -> refusé (jamais un simple "montre tout par défaut").
    const noContextRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/browse`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(noContextRes.status).toBe(404);
    expect(((await noContextRes.json()) as { error: { code: string } }).error.code).toBe("EXTERNAL_CONNECTION_CLIENT_NOT_ALLOWED");

    // Client B (hors périmètre de la connexion) -> refusé aussi, même en précisant un contexte.
    const wrongClientRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/browse?clientAccountId=${clientBId}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(wrongClientRes.status).toBe(404);

    // Client A (autorisé) -> passe.
    const rightClientRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/browse?clientAccountId=${clientAId}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(rightClientRes.status).toBe(200);

    // OWNER (ConnectorPermission.Manage) reste non affecté par le narrowing en navigation, même
    // sans préciser de contexte client — motif déjà établi (OWNER/ADMIN superset).
    const ownerRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/browse`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(ownerRes.status).toBe(200);
  });

  it("BLOQUANT — a CONTRIBUTOR without ConnectorPermission.Manage cannot initiate a connection (403), but CAN import once one exists (mission §48)", async () => {
    const initiateRes = await fetch(`${baseUrl}/api/v1/connectors`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({ provider: ConnectorProvider.GoogleWorkspace, name: "Karim tries" }) });
    expect(initiateRes.status).toBe(403);

    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "For contributor import" });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    // ConnectorPermission.DocumentImport (org-tier) autorise déjà Karim, mais l'attachement au
    // Tender passe par `AttachDocumentToTenderUseCase` -> `GetTenderUseCase` -> ClientAccess
    // (mission §50) : sans affectation réelle sur CE client, même un CONTRIBUTOR autorisé côté
    // connecteur reste bloqué au niveau Documents/Tenders, exactement comme un upload classique.
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    const remoteFileId = `remote-file-${randomUUID()}`;
    fakeMicrosoft.downloadedContent.set(remoteFileId, { buffer: Buffer.from("x"), mimeType: "application/pdf", filename: "x.pdf" });
    const importRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/import`, {
      method: "POST",
      headers: authHeaders(tokenKarim, orgAId),
      body: JSON.stringify({ containerId: "fake-container", fileId: remoteFileId, mimeType: "application/pdf", tenderId }),
    });
    expect(importRes.status).toBe(201);
  });

  it("BLOQUANT — mass assignment: forged organizationId/status/encryptedAccessToken in the request body have no effect", async () => {
    const res = await fetch(`${baseUrl}/api/v1/connectors`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ provider: ConnectorProvider.GoogleWorkspace, name: "Mass assignment test", organizationId: orgBId, status: "ACTIVE", encryptedAccessToken: "forged", createdBy: "forged-user" }),
    });
    expect(res.status).toBe(400); // .strict() Zod schema rejects unknown keys outright.
  });

  it("BLOQUANT — mission §47: only one PENDING/ACTIVE/REAUTH_REQUIRED connection per (organization, provider) at a time", async () => {
    await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "First Microsoft connection" });
    const secondRes = await fetch(`${baseUrl}/api/v1/connectors`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ provider: ConnectorProvider.Microsoft365, name: "Second attempt" }) });
    expect(secondRes.status).toBe(409);
  });

  it("BLOQUANT — mission §55/§102: OAuth state tampering — a forged/unknown state is refused, never activates any connection", async () => {
    const callbackRes = await fetch(`${baseUrl}/api/v1/connectors/oauth/microsoft-365/callback?state=${randomUUID()}&code=irrelevant`, { redirect: "manual" });
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.get("location")).toContain("connectorError=");
  });

  it("BLOQUANT — mission §55: a state already consumed once can never be replayed", async () => {
    await ensureNoActiveConnection(orgAId, ConnectorProvider.GoogleWorkspace);
    const initiateRes = await fetch(`${baseUrl}/api/v1/connectors`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ provider: ConnectorProvider.GoogleWorkspace, name: "Replay test" }) });
    const { authorizationUrl } = (await initiateRes.json()) as { authorizationUrl: string };
    const state = new URL(authorizationUrl).searchParams.get("state")!;

    const first = await fetch(`${baseUrl}/api/v1/connectors/oauth/google-workspace/callback?state=${encodeURIComponent(state)}&code=fake-code`, { redirect: "manual" });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toContain("connectorConnected=1");

    const replay = await fetch(`${baseUrl}/api/v1/connectors/oauth/google-workspace/callback?state=${encodeURIComponent(state)}&code=fake-code`, { redirect: "manual" });
    expect(replay.headers.get("location")).toContain("connectorError=");
  });

  it("mission §11: a definitively failed refresh moves the connection to REAUTH_REQUIRED, never silently deleted", async () => {
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Will need reauth" });
    await prisma.externalConnection.update({ where: { id: connectionId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    fakeMicrosoft.shouldFailRefresh = true;

    const browseRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/browse`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(browseRes.status).toBe(409);

    const stillThere = await prisma.externalConnection.findFirst({ where: { id: connectionId } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("REAUTH_REQUIRED");
    fakeMicrosoft.shouldFailRefresh = false;
  });

  it("mission §69: reauthorize an existing REAUTH_REQUIRED connection reuses the SAME row, never a duplicate", async () => {
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Reauth flow" });
    await prisma.externalConnection.update({ where: { id: connectionId }, data: { status: "REAUTH_REQUIRED" } });

    const reauthRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/reauthorize`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(reauthRes.status).toBe(200);
    const { authorizationUrl } = (await reauthRes.json()) as { authorizationUrl: string };
    const state = new URL(authorizationUrl).searchParams.get("state")!;

    const callbackRes = await fetch(`${baseUrl}/api/v1/connectors/oauth/microsoft-365/callback?state=${encodeURIComponent(state)}&code=fake-code`, { redirect: "manual" });
    expect(callbackRes.headers.get("location")).toContain("connectorConnected=1");

    const all = await prisma.externalConnection.findMany({ where: { organizationId: orgAId, id: connectionId } });
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("ACTIVE");
  });
});
