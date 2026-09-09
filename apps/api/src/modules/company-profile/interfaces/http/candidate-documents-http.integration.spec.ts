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
 * Checkpoint TENDEROS-2.1-CCV2-D — preuves HTTP + PostgreSQL + stockage réels du cycle de vie
 * documentaire de l'entreprise candidate.
 *
 * Le fichier est TOUJOURS téléversé par le moteur existant (`POST /documents`, multipart) puis
 * rattaché au candidat : c'est le contrat réel de TenderOS, et ces preuves valident donc la vraie
 * chaîne, pas une chaîne parallèle inventée pour le test.
 */
describe("CCV2-D — documents CandidateCompany (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let membershipRepository: PrismaMembershipRepository;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];
  const documentIds: string[] = [];

  let tokenA: string;
  let userA: string;
  let membershipAId: string;
  let tokenB: string;

  let candidateA1: string;
  let candidateA2: string;
  let candidateB1: string;

  const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-D HTTP", termsAccepted: true }),
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
  function docsUrl(candidateCompanyId: string, documentId?: string, suffix = ""): string {
    return `${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}/documents${documentId ? `/${documentId}` : ""}${suffix}`;
  }

  /** Téléversement par le VRAI moteur documentaire — jamais une insertion directe en base. */
  async function uploadDocument(token: string, organizationId: string, filename: string, content = PDF, mime = "application/pdf"): Promise<Response> {
    const form = new FormData();
    form.append("file", new Blob([content], { type: mime }), filename);
    form.append("title", filename);
    form.append("domain", "ORGANIZATION");
    form.append("origin", "USER_UPLOAD");
    return fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authOnly(token, organizationId), body: form });
  }

  async function uploadedId(token: string, organizationId: string, filename: string): Promise<string> {
    const res = await uploadDocument(token, organizationId, filename);
    const id = ((await res.json()) as { id: string }).id;
    documentIds.push(id);
    return id;
  }

  async function addVersion(token: string, organizationId: string, documentId: string, filename: string, content: Buffer): Promise<Response> {
    const form = new FormData();
    form.append("file", new Blob([content], { type: "application/pdf" }), filename);
    return fetch(`${baseUrl}/api/v1/documents/${documentId}/versions`, { method: "POST", headers: authOnly(token, organizationId), body: form });
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

    await prisma.organization.create({ data: { id: orgA, name: "D A", slug: `d-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "D B", slug: `d-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`d-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`d-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    candidateA1 = await createCandidate(orgA, tokenA, `A1 ${randomUUID()}`);
    candidateA2 = await createCandidate(orgA, tokenA, `A2 ${randomUUID()}`);
    candidateB1 = await createCandidate(orgB, tokenB, `B1 ${randomUUID()}`);
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

  describe("E2E — cycle de vie complet", () => {
    it("upload → rattachement → liste → métadonnées → téléchargement → V2 → historique V1 → mise à jour → dissociation", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "kbis.pdf");

      const attached = await fetch(docsUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ documentId, category: "KBIS", label: "Extrait Kbis", validUntil: "2027-01-01T00:00:00.000Z" }),
      });
      expect(attached.status).toBe(201);
      const attachedBody = (await attached.json()) as Record<string, unknown>;
      expect(attachedBody.category).toBe("KBIS");
      expect(attachedBody.temporalStatus).toBe("VALID");
      // Aucune donnée du moteur de stockage ne fuit dans la vue candidate.
      expect(attachedBody).not.toHaveProperty("storageKey");
      expect(attachedBody).not.toHaveProperty("checksum");

      const listed = await fetch(docsUrl(candidateA1), { headers: headers(tokenA, orgA) });
      expect(listed.status).toBe(200);
      expect(((await listed.json()) as { items: { documentId: string }[] }).items.map((i) => i.documentId)).toContain(documentId);

      const detail = await fetch(docsUrl(candidateA1, documentId), { headers: headers(tokenA, orgA) });
      expect(detail.status).toBe(200);
      const detailBody = (await detail.json()) as { document: { currentVersionNumber: number } };
      expect(detailBody.document.currentVersionNumber).toBe(1);

      const downloadV1 = await fetch(docsUrl(candidateA1, documentId, "/download"), { headers: authOnly(tokenA, orgA) });
      expect(downloadV1.status).toBe(200);
      expect(Buffer.from(await downloadV1.arrayBuffer())).toEqual(PDF);

      // --- Remplacement : V2 puis V3, par le moteur existant.
      const V2 = Buffer.from("%PDF-1.4 v2\n%%EOF\n");
      expect((await addVersion(tokenA, orgA, documentId, "kbis-v2.pdf", V2)).status).toBe(201);
      const V3 = Buffer.from("%PDF-1.4 v3\n%%EOF\n");
      expect((await addVersion(tokenA, orgA, documentId, "kbis-v3.pdf", V3)).status).toBe(201);

      const versions = await prisma.documentVersion.findMany({ where: { documentId }, orderBy: { versionNumber: "asc" } });
      expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
      // IMMUTABILITÉ : V1 est intacte, avec sa propre clé de stockage — un dossier AO qui
      // référençait V1 peut toujours prouver quelle version il avait utilisée.
      expect(versions[0]?.checksum).not.toBe(versions[1]?.checksum);
      expect(new Set(versions.map((v) => v.storageKey)).size).toBe(3);

      const document = await prisma.document.findUnique({ where: { id: documentId } });
      expect(document?.currentVersionNumber).toBe(3);
      expect(document?.currentVersionId).toBe(versions[2]?.id);

      const downloadCurrent = await fetch(docsUrl(candidateA1, documentId, "/download"), { headers: authOnly(tokenA, orgA) });
      expect(Buffer.from(await downloadCurrent.arrayBuffer())).toEqual(V3);

      const historicalV1 = await fetch(`${baseUrl}/api/v1/documents/${documentId}/versions/${versions[0]!.id}/download`, { headers: authOnly(tokenA, orgA) });
      expect(historicalV1.status).toBe(200);
      expect(Buffer.from(await historicalV1.arrayBuffer())).toEqual(PDF);

      const patched = await fetch(docsUrl(candidateA1, documentId), {
        method: "PATCH",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ label: "Kbis 2026", validUntil: "2020-01-01T00:00:00.000Z" }),
      });
      expect(patched.status).toBe(200);
      expect(((await patched.json()) as Record<string, unknown>).temporalStatus).toBe("EXPIRED");

      // --- Dissociation : l'association disparaît, le DOCUMENT et ses 3 versions survivent.
      const detached = await fetch(docsUrl(candidateA1, documentId), { method: "DELETE", headers: headers(tokenA, orgA) });
      expect(detached.status).toBe(204);
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId } })).toBe(0);
      expect(await prisma.document.findUnique({ where: { id: documentId } })).not.toBeNull();
      expect(await prisma.documentVersion.count({ where: { documentId } })).toBe(3);
    }, 180000);
  });

  describe("EXPIRATION — statut calculé, jamais persisté", () => {
    it("VALID / EXPIRING_SOON / EXPIRED / NO_EXPIRY, avec la frontière des 30 jours", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const cases = [
        { name: "valide", validUntil: new Date(now + 120 * day).toISOString(), expected: "VALID" },
        { name: "juste avant la frontière", validUntil: new Date(now + 29 * day).toISOString(), expected: "EXPIRING_SOON" },
        { name: "expire", validUntil: new Date(now - day).toISOString(), expected: "EXPIRED" },
        { name: "sans expiration", validUntil: undefined, expected: "NO_EXPIRY" },
      ];

      for (const testCase of cases) {
        const documentId = await uploadedId(tokenA, orgA, `exp-${testCase.name}.pdf`);
        const res = await fetch(docsUrl(candidateA1), {
          method: "POST",
          headers: headers(tokenA, orgA),
          body: JSON.stringify({ documentId, category: "TAX_CERTIFICATE", ...(testCase.validUntil ? { validUntil: testCase.validUntil } : {}) }),
        });
        expect(res.status).toBe(201);
        expect(((await res.json()) as Record<string, unknown>).temporalStatus).toBe(testCase.expected);
      }

      // Aucune colonne de statut n'existe : la ligne ne porte QUE la date, donc la date courante ne
      // peut jamais modifier silencieusement le document.
      const stored = await prisma.documentCandidateCompanyAssociation.findFirst({ where: { candidateCompanyId: candidateA1 } });
      expect(stored).not.toHaveProperty("temporalStatus");
      expect(stored).not.toHaveProperty("status");
    }, 180000);
  });

  describe("SÉCURITÉ BANCAIRE — exigence P0", () => {
    it("un RIB n'est jamais accessible avec le seul candidate:read, ni par la route candidate ni par la route générique /documents", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const ribId = await uploadedId(tokenA, orgA, "rib.pdf");
      expect(
        (await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: ribId, category: "BANK_DETAILS", label: "RIB" }) })).status,
      ).toBe(201);

      const generalId = await uploadedId(tokenA, orgA, "attestation.pdf");
      await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: generalId, category: "SOCIAL_CERTIFICATE" }) });

      for (const role of [OrganizationRole.Contributor, OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly]) {
        await setRoleInOrgA(role);

        // Le listing candidate NE RÉVÈLE PAS la pièce bancaire — pas même son existence.
        const listed = await fetch(docsUrl(candidateA1), { headers: headers(tokenA, orgA) });
        expect(listed.status).toBe(200);
        const raw = await listed.text();
        expect(raw).not.toContain(ribId);
        expect(raw).not.toContain("BANK_DETAILS");
        expect(JSON.parse(raw).items.map((i: { documentId: string }) => i.documentId)).toContain(generalId);

        // Route candidate : refus explicite.
        expect((await fetch(docsUrl(candidateA1, ribId), { headers: headers(tokenA, orgA) })).status).toBe(403);
        expect((await fetch(docsUrl(candidateA1, ribId, "/download"), { headers: authOnly(tokenA, orgA) })).status).toBe(403);

        // Route GÉNÉRIQUE du moteur documentaire : le contournement est fermé.
        const generic = await fetch(`${baseUrl}/api/v1/documents/${ribId}/download`, { headers: authOnly(tokenA, orgA) });
        expect(generic.status).toBe(403);
        expect((await fetch(`${baseUrl}/api/v1/documents/${ribId}`, { headers: authOnly(tokenA, orgA) })).status).toBe(403);

        // Le document NON bancaire reste accessible : aucun durcissement collatéral.
        expect((await fetch(`${baseUrl}/api/v1/documents/${generalId}/download`, { headers: authOnly(tokenA, orgA) })).status).toBe(200);
      }

      // BID_MANAGER dispose de read_banking : il voit tout.
      await setRoleInOrgA(OrganizationRole.BidManager);
      expect((await fetch(docsUrl(candidateA1, ribId, "/download"), { headers: authOnly(tokenA, orgA) })).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/v1/documents/${ribId}/download`, { headers: authOnly(tokenA, orgA) })).status).toBe(200);
      const listedByManager = await fetch(docsUrl(candidateA1), { headers: headers(tokenA, orgA) });
      expect((await listedByManager.text())).toContain("BANK_DETAILS");
    }, 240000);

    it("un CONTRIBUTOR ne peut pas rattacher une pièce bancaire, mais peut rattacher une pièce générale", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const ribId = await uploadedId(tokenA, orgA, "rib-contrib.pdf");
      const generalId = await uploadedId(tokenA, orgA, "kbis-contrib.pdf");

      await setRoleInOrgA(OrganizationRole.Contributor);
      const refused = await fetch(docsUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: ribId, category: "BANK_DETAILS" }) });
      expect(refused.status).toBe(403);
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId: ribId } })).toBe(0);

      const allowed = await fetch(docsUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: generalId, category: "KBIS" }) });
      expect(allowed.status).toBe(201);
    }, 120000);
  });

  describe("PERMISSIONS CCV2-A", () => {
    it("CONTRIBUTOR : lecture OK, rattachement OK, dissociation REFUSÉE (403) et zéro écriture", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "contrib-delete.pdf");
      await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "OTHER" }) });

      await setRoleInOrgA(OrganizationRole.Contributor);
      expect((await fetch(docsUrl(candidateA1), { headers: headers(tokenA, orgA) })).status).toBe(200);
      const refused = await fetch(docsUrl(candidateA1, documentId), { method: "DELETE", headers: headers(tokenA, orgA) });
      expect(refused.status).toBe(403);
      expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("CANDIDATE_PERMISSION_MISSING");
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId } })).toBe(1);
    }, 120000);

    it.each([OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly])(
      "%s : rattachement et dissociation refusés (403), zéro écriture",
      async (role) => {
        await setRoleInOrgA(OrganizationRole.Owner);
        const documentId = await uploadedId(tokenA, orgA, `ro-${role}.pdf`);

        await setRoleInOrgA(role);
        expect((await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "OTHER" }) })).status).toBe(403);
        expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId } })).toBe(0);
      },
      120000,
    );
  });

  describe("ISOLATION tenant / cross-candidate / en-tête forgé", () => {
    it("un document rattaché à A1 est inaccessible via A2, via orgB et via en-tête forgé — 404, jamais 403", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "isole.pdf");
      await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "KBIS" }) });

      // Même organisation, AUTRE candidat — métadonnées, téléchargement, mise à jour, dissociation.
      expect((await fetch(docsUrl(candidateA2, documentId), { headers: headers(tokenA, orgA) })).status).toBe(404);
      expect((await fetch(docsUrl(candidateA2, documentId, "/download"), { headers: authOnly(tokenA, orgA) })).status).toBe(404);
      expect((await fetch(docsUrl(candidateA2, documentId), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ label: "pirate" }) })).status).toBe(404);
      expect((await fetch(docsUrl(candidateA2, documentId), { method: "DELETE", headers: headers(tokenA, orgA) })).status).toBe(404);
      expect(((await fetch(docsUrl(candidateA2), { headers: headers(tokenA, orgA) })).status)).toBe(200);

      // Autre organisation, depuis son propre tenant puis en-tête FORGÉ.
      expect((await fetch(docsUrl(candidateA1, documentId), { headers: headers(tokenB, orgB) })).status).toBe(404);
      const forged = await fetch(docsUrl(candidateA1, documentId), { headers: headers(tokenB, orgA) });
      expect(forged.status).toBe(404);
      expect(((await forged.json()) as { error: { code: string } }).error.code).toBe("ORGANIZATION_ACCESS_DENIED");
      expect((await fetch(docsUrl(candidateA1, documentId), { method: "DELETE", headers: headers(tokenB, orgA) })).status).toBe(404);

      // ZERO UNAUTHORIZED WRITE.
      const association = await prisma.documentCandidateCompanyAssociation.findFirst({ where: { documentId } });
      expect(association?.candidateCompanyId).toBe(candidateA1);
      expect(association?.label).toBeNull();
    }, 180000);

    it("rattacher à un candidat d'une AUTRE organisation est impossible", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "cross.pdf");
      expect((await fetch(docsUrl(candidateB1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "KBIS" }) })).status).toBe(404);
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { candidateCompanyId: candidateB1 } })).toBe(0);
    }, 90000);

    it("rattacher un document d'une AUTRE organisation est impossible", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const foreign = await uploadDocument(tokenB, orgB, "etranger.pdf");
      const foreignId = ((await foreign.json()) as { id: string }).id;
      documentIds.push(foreignId);

      const res = await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: foreignId, category: "KBIS" }) });
      expect(res.status).toBe(404);
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId: foreignId } })).toBe(0);
    }, 120000);
  });

  describe("MASS ASSIGNMENT & MATRICE NÉGATIVE", () => {
    it("un corps hostile est rejeté (400) et n'écrit rien", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "mass.pdf");
      const res = await fetch(docsUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ documentId, category: "KBIS", organizationId: orgB, candidateCompanyId: candidateB1, storageKey: "forge/x", currentVersionId: randomUUID() }),
      });
      expect(res.status).toBe(400);
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId } })).toBe(0);
    }, 90000);

    it("candidat inexistant, document inexistant, catégorie hors catalogue, dates incohérentes, double dissociation — jamais de 500", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "negative.pdf");

      const statuses = [
        (await fetch(docsUrl(randomUUID()), { headers: headers(tokenA, orgA) })).status,
        (await fetch(docsUrl(candidateA1, randomUUID()), { headers: headers(tokenA, orgA) })).status,
        (await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: randomUUID(), category: "KBIS" }) })).status,
        (await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "N_IMPORTE_QUOI" }) })).status,
        (
          await fetch(docsUrl(candidateA1), {
            method: "POST",
            headers: headers(tokenA, orgA),
            body: JSON.stringify({ documentId, category: "KBIS", validFrom: "2027-01-01T00:00:00.000Z", validUntil: "2026-01-01T00:00:00.000Z" }),
          })
        ).status,
      ];
      expect(statuses).toEqual([404, 404, 404, 400, 400]);

      // Rattachement, puis double dissociation, puis nouveau rattachement possible.
      expect((await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "KBIS" }) })).status).toBe(201);
      expect((await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "KBIS" }) })).status).toBe(409);
      expect((await fetch(docsUrl(candidateA1, documentId), { method: "DELETE", headers: headers(tokenA, orgA) })).status).toBe(204);
      expect((await fetch(docsUrl(candidateA1, documentId), { method: "DELETE", headers: headers(tokenA, orgA) })).status).toBe(404);
      expect((await fetch(docsUrl(candidateA1, documentId), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ label: "après" }) })).status).toBe(404);
    }, 180000);

    it("un fichier vide et un type interdit sont refusés par le moteur documentaire, jamais contournés", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      expect((await uploadDocument(tokenA, orgA, "vide.pdf", Buffer.alloc(0))).status).toBeGreaterThanOrEqual(400);
      expect((await uploadDocument(tokenA, orgA, "script.exe", Buffer.from("MZ"), "application/x-msdownload")).status).toBeGreaterThanOrEqual(400);
    }, 90000);
  });

  describe("CONCURRENCE", () => {
    it("deux dissociations concurrentes, et PATCH vs DELETE : aucun 500, aucun état impossible", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const first = await uploadedId(tokenA, orgA, "conc1.pdf");
      await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: first, category: "OTHER" }) });
      const [d1, d2] = await Promise.all([
        fetch(docsUrl(candidateA1, first), { method: "DELETE", headers: headers(tokenA, orgA) }),
        fetch(docsUrl(candidateA1, first), { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]);
      expect([d1.status, d2.status]).not.toContain(500);
      expect([d1.status, d2.status].every((s) => s === 204 || s === 404)).toBe(true);
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId: first } })).toBe(0);
      // Le fichier survit à la dissociation concurrente.
      expect(await prisma.document.findUnique({ where: { id: first } })).not.toBeNull();

      const second = await uploadedId(tokenA, orgA, "conc2.pdf");
      await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId: second, category: "OTHER" }) });
      const [p, d] = await Promise.all([
        fetch(docsUrl(candidateA1, second), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ label: "concurrent" }) }),
        fetch(docsUrl(candidateA1, second), { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]);
      expect([p.status, d.status]).not.toContain(500);
      const remaining = await prisma.documentCandidateCompanyAssociation.findMany({ where: { documentId: second } });
      expect(remaining.length).toBeLessThanOrEqual(1);
      for (const row of remaining) {
        expect(row.candidateCompanyId).toBe(candidateA1);
      }
    }, 180000);

    it("deux ajouts de version concurrents ne créent jamais de version orpheline ni de numéro dupliqué", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "versions-conc.pdf");
      await fetch(docsUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "OTHER" }) });

      const [r1, r2] = await Promise.all([
        addVersion(tokenA, orgA, documentId, "v-a.pdf", Buffer.from("%PDF-a\n%%EOF\n")),
        addVersion(tokenA, orgA, documentId, "v-b.pdf", Buffer.from("%PDF-b\n%%EOF\n")),
      ]);
      expect([r1.status, r2.status]).not.toContain(500);

      const versions = await prisma.documentVersion.findMany({ where: { documentId }, orderBy: { versionNumber: "asc" } });
      const numbers = versions.map((v) => v.versionNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
      const document = await prisma.document.findUnique({ where: { id: documentId } });
      expect(numbers).toContain(document?.currentVersionNumber);
      expect(versions.map((v) => v.id)).toContain(document?.currentVersionId);
    }, 180000);
  });

  describe("AUCUN FALLBACK & AUDIT", () => {
    it("un candidat sans document renvoie une liste VIDE, jamais les documents d'un ClientAccount", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const vierge = await createCandidate(orgA, tokenA, `Vierge ${randomUUID()}`);
      const res = await fetch(docsUrl(vierge), { headers: headers(tokenA, orgA) });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
    }, 90000);

    it("l'audit trace rattachement et dissociation sur le candidat, sans contenu ni clé de stockage", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const documentId = await uploadedId(tokenA, orgA, "audit.pdf");
      await fetch(docsUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ documentId, category: "KBIS" }) });
      await fetch(docsUrl(candidateA2, documentId), { method: "DELETE", headers: headers(tokenA, orgA) });

      const logs = await prisma.auditLog.findMany({ where: { organizationId: orgA, resourceType: "candidate_company", resourceId: candidateA2 } });
      const actions = logs.map((l) => l.action);
      expect(actions).toContain("candidate_company.document_attached");
      expect(actions).toContain("candidate_company.document_detached");

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain("%PDF");
      expect(serialized).not.toContain("storageKey");
    }, 120000);
  });
});
