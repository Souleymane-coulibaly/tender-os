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

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.1 — gap F1 (DOCUMENT_VERSIONING_UI).
 *
 * Deux objets distincts, prouvés ici sur HTTP + PostgreSQL + stockage réels :
 *
 * 1. La NOUVELLE route `GET /candidate-companies/:id/documents/:documentId/versions` — une façade,
 *    pas un second moteur : la liste provient de `ListDocumentVersionsUseCase`, et la version
 *    courante du pointeur porté par le Document, jamais du numéro le plus élevé.
 *
 * 2. RÉGRESSION d'un trou P1 trouvé pendant l'audit de ce gap : la route générique
 *    `GET /documents/:id/versions` appliquait l'isolation tenant et `DocumentPermission.Read`
 *    — accordée à TOUS les rôles — mais PAS le rétrécissement bancaire introduit en CCV2-D sur
 *    `get`/`download`. Or `DocumentVersionSummary` expose `originalFilename` et `checksum` : un
 *    READ_ONLY pouvait donc énumérer l'historique d'un RIB (« RIB-BNP-Alpha.pdf ») sans jamais
 *    disposer de `candidate:read_banking`. Le trou est fermé ; ces preuves l'empêchent de revenir.
 */
describe("CCV2-F.1 — historique des versions d'une pièce candidate (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let membershipRepository: PrismaMembershipRepository;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  let tokenA: string;
  let userA: string;
  let membershipAId: string;
  let tokenB: string;

  let candidateA1: string;
  let candidateA2: string;

  /** Nom de fichier sentinelle : s'il apparaît dans une réponse, la fuite est prouvée textuellement. */
  const RIB_FILENAME = "RIB-BNP-Alpha-CCV2F1.pdf";
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-F1 HTTP", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }

  async function setRoleInOrgA(role: (typeof OrganizationRole)[keyof typeof OrganizationRole]): Promise<void> {
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(membershipAId), organizationId: orgA, userId: userA, role, occurredAt: new Date() }),
    );
  }

  function headers(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }
  function authOnly(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }
  function versionsUrl(candidateCompanyId: string, documentId: string): string {
    return `${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}/documents/${documentId}/versions`;
  }
  function genericVersionsUrl(documentId: string): string {
    return `${baseUrl}/api/v1/documents/${documentId}/versions`;
  }

  /** Le VRAI moteur documentaire — jamais une insertion directe en base. */
  async function uploadedId(token: string, organizationId: string, filename: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([PDF], { type: "application/pdf" }), filename);
    form.append("title", filename);
    form.append("domain", "ORGANIZATION");
    form.append("origin", "USER_UPLOAD");
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authOnly(token, organizationId), body: form });
    return ((await res.json()) as { id: string }).id;
  }

  async function addVersion(token: string, organizationId: string, documentId: string, filename: string, content: Buffer): Promise<number> {
    const form = new FormData();
    form.append("file", new Blob([content], { type: "application/pdf" }), filename);
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentId}/versions`, { method: "POST", headers: authOnly(token, organizationId), body: form });
    return res.status;
  }

  async function attach(candidateCompanyId: string, documentId: string, category: string, token = tokenA, organizationId = orgA): Promise<number> {
    const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}/documents`, {
      method: "POST",
      headers: headers(token, organizationId),
      body: JSON.stringify({ documentId, category }),
    });
    return res.status;
  }

  async function createCandidate(organizationId: string, token: string, name: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/v1/candidate-companies`, { method: "POST", headers: headers(token, organizationId), body: JSON.stringify({ name }) });
    return ((await res.json()) as { id: string }).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    prisma = moduleRef.get(PrismaService);
    membershipRepository = new PrismaMembershipRepository(prisma);

    await prisma.organization.create({ data: { id: orgA, name: "F1 A", slug: `f1-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "F1 B", slug: `f1-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`f1-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`f1-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    candidateA1 = await createCandidate(orgA, tokenA, `F1 A1 ${randomUUID()}`);
    candidateA2 = await createCandidate(orgA, tokenA, `F1 A2 ${randomUUID()}`);
  }, 180000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.documentCandidateCompanyAssociation.deleteMany({ where: { organizationId } });
      await prisma.documentVersion.deleteMany({ where: { organizationId } });
      await prisma.document.deleteMany({ where: { organizationId } });
      await prisma.candidateCompany.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.outboxEvent.deleteMany({ where: { organizationId } });
      await prisma.membershipRole.deleteMany({ where: { membership: { organizationId } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await app.close();
  }, 60000);

  describe("Nominal — la façade reflète l'état réel du moteur documentaire", () => {
    it("liste les 3 versions dans l'ordre, et donne la version COURANTE d'après le pointeur du Document", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "kbis-f1.pdf");
      expect(await attach(candidateA1, documentId, "KBIS")).toBe(201);
      expect(await addVersion(tokenA, orgA, documentId, "kbis-f1-v2.pdf", Buffer.from("%PDF-1.4 v2\n%%EOF\n"))).toBe(201);
      expect(await addVersion(tokenA, orgA, documentId, "kbis-f1-v3.pdf", Buffer.from("%PDF-1.4 v3\n%%EOF\n"))).toBe(201);

      const res = await fetch(versionsUrl(candidateA1, documentId), { headers: headers(tokenA, orgA) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { versions: { id: string; versionNumber: number; originalFilename: string }[]; currentVersionId: string };
      expect(body.versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
      expect(body.versions.map((v) => v.originalFilename)).toEqual(["kbis-f1.pdf", "kbis-f1-v2.pdf", "kbis-f1-v3.pdf"]);

      // La preuve que `currentVersionId` n'est PAS reconstruit : il est comparé au pointeur en base.
      const document = await prisma.document.findUnique({ where: { id: documentId } });
      expect(document?.currentVersionId).toBeTruthy();
      expect(body.currentVersionId).toBe(document?.currentVersionId);
    }, 240000);
  });

  describe("Preuves négatives — DATA_EXPOSURE = 0", () => {
    it("document d'un AUTRE candidat, d'une AUTRE organisation, candidat forgé, document non rattaché : 404, jamais 403", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "isolation-f1.pdf");
      expect(await attach(candidateA1, documentId, "KBIS")).toBe(201);

      // Rattaché à A1 — A2 existe et appartient à la même organisation, mais ne le porte pas.
      const viaOtherCandidate = await fetch(versionsUrl(candidateA2, documentId), { headers: headers(tokenA, orgA) });
      expect(viaOtherCandidate.status).toBe(404);
      expect(await viaOtherCandidate.text()).not.toContain("isolation-f1.pdf");

      // Organisation étrangère : le candidat A1 ne doit même pas exister de son point de vue.
      const viaForeignOrg = await fetch(versionsUrl(candidateA1, documentId), { headers: headers(tokenB, orgB) });
      expect(viaForeignOrg.status).toBe(404);

      // En-tête d'organisation forgé : jeton d'orgB présenté avec `X-Organization-Id: orgA`.
      expect((await fetch(versionsUrl(candidateA1, documentId), { headers: headers(tokenB, orgA) })).status).toBe(404);

      // Identifiant de candidat inventé.
      expect((await fetch(versionsUrl(randomUUID(), documentId), { headers: headers(tokenA, orgA) })).status).toBe(404);

      // Document réel de l'organisation, mais JAMAIS rattaché à ce candidat.
      const unassociated = await uploadedId(tokenA, orgA, "jamais-rattache-f1.pdf");
      const viaUnassociated = await fetch(versionsUrl(candidateA1, unassociated), { headers: headers(tokenA, orgA) });
      expect(viaUnassociated.status).toBe(404);
      expect(await viaUnassociated.text()).not.toContain("jamais-rattache-f1.pdf");

      // Document inexistant.
      expect((await fetch(versionsUrl(candidateA1, randomUUID()), { headers: headers(tokenA, orgA) })).status).toBe(404);
    }, 240000);

    it("RÉGRESSION P1 — l'historique d'un RIB reste inaccessible sans candidate:read_banking, y compris par la route générique /documents/:id/versions", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const ribId = await uploadedId(tokenA, orgA, RIB_FILENAME);
      expect(await attach(candidateA1, ribId, "BANK_DETAILS")).toBe(201);
      expect(await addVersion(tokenA, orgA, ribId, "RIB-BNP-Alpha-CCV2F1-v2.pdf", Buffer.from("%PDF-1.4 rib v2\n%%EOF\n"))).toBe(201);

      const generalId = await uploadedId(tokenA, orgA, "attestation-f1.pdf");
      expect(await attach(candidateA1, generalId, "SOCIAL_CERTIFICATE")).toBe(201);

      for (const role of [OrganizationRole.Contributor, OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly]) {
        await setRoleInOrgA(role);

        // Façade candidate : refus explicite de rôle, évalué avant toute lecture.
        expect((await fetch(versionsUrl(candidateA1, ribId), { headers: headers(tokenA, orgA) })).status).toBe(403);

        // Route GÉNÉRIQUE — c'est ICI que se trouvait le trou. `DocumentPermission.Read` est
        // accordée à tous les rôles : sans le rétrécissement, ce 403 serait un 200 exposant
        // `originalFilename` et `checksum` de chaque version du RIB.
        const generic = await fetch(genericVersionsUrl(ribId), { headers: authOnly(tokenA, orgA) });
        expect(generic.status).toBe(403);
        const genericBody = await generic.text();
        expect(genericBody).not.toContain(RIB_FILENAME);
        expect(genericBody).not.toContain("RIB-BNP-Alpha-CCV2F1-v2.pdf");

        // Aucun durcissement collatéral : l'historique d'une pièce NON bancaire reste lisible.
        expect((await fetch(versionsUrl(candidateA1, generalId), { headers: headers(tokenA, orgA) })).status).toBe(200);
        expect((await fetch(genericVersionsUrl(generalId), { headers: authOnly(tokenA, orgA) })).status).toBe(200);
      }

      // BID_MANAGER dispose de `candidate:read_banking` : les deux routes lui répondent.
      await setRoleInOrgA(OrganizationRole.BidManager);
      const allowed = await fetch(versionsUrl(candidateA1, ribId), { headers: headers(tokenA, orgA) });
      expect(allowed.status).toBe(200);
      const allowedBody = (await allowed.json()) as { versions: { versionNumber: number }[] };
      expect(allowedBody.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
      expect((await fetch(genericVersionsUrl(ribId), { headers: authOnly(tokenA, orgA) })).status).toBe(200);
    }, 300000);
  });
});
