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

  it("mission §26 (POINT MAJEUR) — importing the SAME remote file twice with IDENTICAL content reuses the same Document, never a duplicate", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Import idempotence" });

    const remoteFileId = `remote-file-${randomUUID()}`;
    fakeMicrosoft.downloadedContent.set(remoteFileId, { buffer: Buffer.from("contenu identique retenté"), mimeType: "application/pdf", filename: "cctp.pdf" });
    const importOnce = async (): Promise<{ id: string; currentVersion: { id: string } }> => {
      const res = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/import`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ containerId: "fake-container", fileId: remoteFileId, mimeType: "application/pdf", clientAccountId, tenderId }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { id: string; currentVersion: { id: string } };
    };

    const first = await importOnce();
    const second = await importOnce();

    expect(second.id).toBe(first.id);
    expect(second.currentVersion.id).toBe(first.currentVersion.id);
    const versions = await prisma.documentVersion.findMany({ where: { organizationId: orgAId, documentId: first.id } });
    expect(versions).toHaveLength(1);

    // Un contenu réellement MODIFIÉ côté provider (même remoteFileId) reste une nouvelle version
    // légitime, jamais bloqué par la garde d'idempotence.
    fakeMicrosoft.downloadedContent.set(remoteFileId, { buffer: Buffer.from("contenu modifié côté SharePoint"), mimeType: "application/pdf", filename: "cctp.pdf" });
    const third = await importOnce();
    expect(third.id).toBe(first.id);
    expect(third.currentVersion.id).not.toBe(first.currentVersion.id);
    const versionsAfterChange = await prisma.documentVersion.findMany({ where: { organizationId: orgAId, documentId: first.id } });
    expect(versionsAfterChange).toHaveLength(2);
  });

  it("mission §27 (POINT MAJEUR) — exporting the SAME DocumentVersion to the SAME destination twice reuses the same remote file, never a duplicate upload", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Export idempotence" });
    const { documentId, documentVersionId } = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "memoire-idempotence.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId, tenderId });

    const exportOnce = async (): Promise<{ id: string }> => {
      const res = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/export`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ containerId: "fake-container", folderId: "fake-folder", documentId, versionId: documentVersionId, clientAccountId }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { id: string };
    };

    const uploadsBefore = fakeMicrosoft.uploadedFiles.length;
    const first = await exportOnce();
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore + 1);

    const second = await exportOnce();
    expect(second.id).toBe(first.id);
    // Toujours un seul upload distant après le second appel — jamais une seconde copie créée par
    // la relecture idempotente.
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore + 1);
  });

  it("BLOQUANT (concurrence, correctif audit Codex P1-001) — mission §26/§95: two TRULY SIMULTANEOUS imports of the SAME remote file never create two Documents", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Import concurrency" });

    const remoteFileId = `remote-file-${randomUUID()}`;
    fakeMicrosoft.downloadedContent.set(remoteFileId, { buffer: Buffer.from("contenu importé simultanément"), mimeType: "application/pdf", filename: "concurrent.pdf" });

    const importOnce = async (): Promise<{ id: string; currentVersion: { id: string } }> => {
      const res = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/import`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ containerId: "fake-container", fileId: remoteFileId, mimeType: "application/pdf", clientAccountId, tenderId }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { id: string; currentVersion: { id: string } };
    };

    // Promise.all — les deux requêtes HTTP réelles partent EN MÊME TEMPS, jamais séquentiellement
    // (contrairement au test d'idempotence ci-dessus, qui attend la première avant de lancer la
    // seconde et ne peut donc pas prouver l'absence de race).
    const [a, b] = await Promise.all([importOnce(), importOnce()]);

    expect(a.id).toBe(b.id);
    expect(a.currentVersion.id).toBe(b.currentVersion.id);
    const versions = await prisma.documentVersion.findMany({ where: { organizationId: orgAId, documentId: a.id } });
    expect(versions).toHaveLength(1);
    const records = await prisma.externalFileImportRecord.findMany({ where: { organizationId: orgAId, connectionId, remoteFileId } });
    expect(records).toHaveLength(1);
  });

  it("BLOQUANT (concurrence, correctif audit Codex P1-001) — mission §27/§95: two TRULY SIMULTANEOUS exports to the SAME destination never upload twice", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Export concurrency" });
    const { documentId, documentVersionId } = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "export-concurrency.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId, tenderId });

    const exportOnce = async (): Promise<{ id: string }> => {
      const res = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/export`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ containerId: "fake-container", folderId: "fake-folder", documentId, versionId: documentVersionId, clientAccountId }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { id: string };
    };

    const uploadsBefore = fakeMicrosoft.uploadedFiles.length;
    const [a, b] = await Promise.all([exportOnce(), exportOnce()]);

    expect(a.id).toBe(b.id);
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore + 1);
    const records = await prisma.externalFileExportRecord.findMany({ where: { organizationId: orgAId, connectionId, documentId, documentVersionId } });
    expect(records).toHaveLength(1);
  });

  it(
    "BLOQUANT (correctif audit Codex P1-002) — a provider upload SLOWER than Prisma's old 5s default interactive-transaction timeout still succeeds, and a concurrent export during that window waits for it instead of uploading twice",
    async () => {
      const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
      const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Slow export" });
      const { documentId, documentVersionId } = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "slow-export.pdf" });
      await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId, tenderId });

      // > 5000ms — l'ancien défaut Prisma pour une transaction interactive (`$transaction`) : avant
      // le correctif P1-002, le verrou d'idempotence tenait cette transaction ouverte PENDANT
      // l'upload, ce qui aurait fait échouer/annuler silencieusement l'écriture de la trace ici.
      fakeMicrosoft.uploadDelayMs = 6_000;

      const exportOnce = async (): Promise<{ status: number; id?: string | undefined }> => {
        const res = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/export`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ containerId: "fake-container", folderId: "fake-folder", documentId, versionId: documentVersionId, clientAccountId }),
        });
        const body = (await res.json()) as { id?: string };
        return { status: res.status, id: body.id };
      };

      const uploadsBefore = fakeMicrosoft.uploadedFiles.length;
      // La seconde requête part PENDANT que la première est encore en plein upload (6s) — sans le
      // correctif, elle passerait `findByDestination` (aucune trace encore écrite, verrou tenu par
      // la première requête MAIS l'upload lent aurait déjà fait expirer/annuler cette transaction) et
      // uploaderait une seconde fois.
      const [first, second] = await Promise.all([exportOnce(), exportOnce()]);
      fakeMicrosoft.uploadDelayMs = 0;

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.id).toBe(first.id);
      expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore + 1);
      const records = await prisma.externalFileExportRecord.findMany({ where: { organizationId: orgAId, connectionId, documentId, documentVersionId } });
      expect(records).toHaveLength(1);
      expect(records[0]!.status).toBe("SUCCEEDED");
    },
    20_000,
  );

  it("BLOQUANT (correctif audit Codex P1-003) — the provider creates the remote file but the response is LOST before TenderOS reads it: a retry never uploads a second copy, it is blocked pending manual reconciliation", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Ambiguous export failure" });
    const { documentId, documentVersionId } = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "ambiguous-export.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId, tenderId });

    // Simule EXACTEMENT le scénario mission §27 : le fake adapter pousse le fichier dans
    // `uploadedFiles` (le provider "a créé le fichier"), PUIS lève une erreur ambiguë (réponse
    // jamais reçue côté TenderOS) — jamais un simple échec "safe to retry".
    fakeMicrosoft.shouldFailUploadAmbiguously = true;
    const uploadsBefore = fakeMicrosoft.uploadedFiles.length;

    const exportOnce = async (): Promise<{ status: number; code?: string | undefined }> => {
      const res = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/export`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ containerId: "fake-container", folderId: "fake-folder", documentId, versionId: documentVersionId, clientAccountId }),
      });
      const body = (await res.json()) as { error?: { code: string } };
      return { status: res.status, code: body.error?.code };
    };

    const first = await exportOnce();
    expect(first.status).toBe(504); // TIMEOUT -> Gateway Timeout, le vrai échec de CET essai.
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore + 1); // le "provider" a bien créé le fichier.

    const stuck = await prisma.externalFileExportRecord.findFirst({ where: { organizationId: orgAId, connectionId, documentId, documentVersionId } });
    expect(stuck?.status).toBe("NEEDS_RECONCILIATION");

    fakeMicrosoft.shouldFailUploadAmbiguously = false;

    // Retry — jamais un second upload silencieux : bloqué tant que personne n'a vérifié/résolu.
    const retry = await exportOnce();
    expect(retry.status).toBe(409);
    expect(retry.code).toBe("EXTERNAL_FILE_EXPORT_NEEDS_RECONCILIATION");
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore + 1); // toujours un seul upload.
  });

  it("mission §6/§78 — test connection: a healthy connection returns ACTIVE and records lastSuccessfulSyncAt, without performing any import/export", async () => {
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Health check happy path" });
    const uploadsBefore = fakeMicrosoft.uploadedFiles.length;

    const testRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/test`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(testRes.status).toBe(200);
    const body = (await testRes.json()) as { status: string; lastSuccessfulSyncAt?: string };
    expect(body.status).toBe("ACTIVE");
    expect(body.lastSuccessfulSyncAt).toBeDefined();
    expect(fakeMicrosoft.uploadedFiles).toHaveLength(uploadsBefore);
  });

  it("mission §6/§9 — test connection: a definitively failed refresh surfaces REAUTH_REQUIRED via the health check, never a 5xx", async () => {
    const connectionId = await connectMicrosoft({ token: tokenOwnerA, organizationId: orgAId, name: "Health check reauth" });
    await prisma.externalConnection.update({ where: { id: connectionId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    fakeMicrosoft.shouldFailRefresh = true;

    const testRes = await fetch(`${baseUrl}/api/v1/connectors/${connectionId}/test`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(testRes.status).toBe(200);
    const body = (await testRes.json()) as { status: string };
    expect(body.status).toBe("REAUTH_REQUIRED");

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
