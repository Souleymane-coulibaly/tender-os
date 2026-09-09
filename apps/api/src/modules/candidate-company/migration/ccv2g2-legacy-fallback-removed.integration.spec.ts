import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../app.module";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Dc1OfficialFormResolver } from "../../administrative-dossier/application/services/official-form-mappers/dc1-official-form-resolver.service";
import { Dc2OfficialFormResolver } from "../../administrative-dossier/application/services/official-form-mappers/dc2-official-form-resolver.service";
import { FindChecklistItemDocumentMatchesUseCase } from "../../checklist-intelligence/application/use-cases/find-checklist-item-document-matches.use-case";
import { GetCompanyProfileUseCase } from "../../company-profile";
import { MembershipId } from "../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../memberships/infrastructure/prisma-membership.repository";
import { TechnicalMemoSectionContextAssembler } from "../../technical-memo/application/services/technical-memo-section-context-assembler";

/**
 * Checkpoint TENDEROS-2.1-CCV2-G.2 — PREUVE DE DÉCOMMISSIONNEMENT, sur PostgreSQL réel et graphe de
 * dépendances Nest complet.
 *
 * Deux sentinelles antagonistes sur le MÊME Tender :
 *  - `LEGACY-CLIENT-SECRET` dans `CompanyLegalIdentity` du `ClientAccount` (surface commerciale) ;
 *  - `NATIVE-CANDIDATE-SECRET` dans `CandidateCompany` (identité juridique du candidat).
 *
 * Trois choses sont établies, dont la troisième est la plus forte :
 *  1. la sentinelle candidate apparaît là où elle doit ;
 *  2. la sentinelle client n'apparaît nulle part ;
 *  3. `GetCompanyProfileUseCase` n'est **jamais invoqué** — mesuré en instrumentant la méthode
 *     réelle, ce qui prouve l'absence de requête et pas seulement l'absence de fuite visible.
 */
describe("CCV2-G.2 — replis Legacy candidate supprimés (PostgreSQL réel)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const organizationId = randomUUID();
  const userId = randomUUID();
  const clientAccountId = randomUUID();
  const candidateA = randomUUID();
  const candidateB = randomUUID();

  let newFlowTenderId: string;
  let legacyFlowTenderId: string;
  let checklistItemId: string;
  let legacyChecklistItemId: string;
  let subcontractorItemId: string;
  let technicalMemoId: string;
  let technicalMemoSectionId: string;
  let legacyMemoId: string;
  let legacyMemoSectionId: string;

  const LEGACY_SENTINEL = "LEGACY-CLIENT-SECRET";
  const NATIVE_SENTINEL = "NATIVE-CANDIDATE-SECRET";
  const NATIVE_B_SENTINEL = "NATIVE-CANDIDATE-BETA";

  /** Compteur d'invocations RÉELLES de `GetCompanyProfileUseCase` (§12). */
  let profileCalls: { clientAccountId: string }[] = [];

  const actor = () => ({ organizationId, actorId: userId, actorRole: OrganizationRole.Owner as string });

  async function createCandidate(id: string, sentinel: string, city: string): Promise<void> {
    await prisma.candidateCompany.create({
      data: {
        id,
        organizationId,
        name: `${sentinel} SAS`,
        nameNormalized: `${sentinel.toLowerCase()} sas`,
        legalName: `${sentinel} SAS`,
        siren: id === candidateA ? "356000000" : "552100554",
        legalForm: `${sentinel}-FORME`,
        status: "ACTIVE",
        createdBy: userId,
      },
    });
    await prisma.candidateEstablishment.create({
      data: {
        id: randomUUID(),
        organizationId,
        candidateCompanyId: id,
        siret: id === candidateA ? "35600000000048" : "55210055400013",
        isPrincipal: true,
        addressLine: `1 rue ${sentinel}`,
        postalCode: "69001",
        city,
        createdBy: userId,
      },
    });
    await prisma.companyRepresentative.create({
      data: {
        id: randomUUID(),
        organizationId,
        candidateCompanyId: id,
        firstName: sentinel,
        lastName: "CONTACT",
        type: "ADMINISTRATIVE_CONTACT",
        email: `${sentinel}@native.test`,
        phone: "0400000000",
        status: "ACTIVE",
        createdBy: userId,
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    // --- Instrumentation : on enveloppe la méthode RÉELLE du singleton Nest. Toute lecture de
    // profil client émise par un consommateur candidate-dépendant sera donc comptée.
    const profileUseCase = app.get(GetCompanyProfileUseCase);
    const original = profileUseCase.execute.bind(profileUseCase);
    (profileUseCase as unknown as { execute: typeof original }).execute = async (input) => {
      profileCalls.push({ clientAccountId: input.clientAccountId });
      return original(input);
    };

    await prisma.organization.create({
      data: { id: organizationId, name: "G2", slug: `g2-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.user.create({
      data: { id: userId, email: `g2-${randomUUID()}@smoke.test`, displayName: "G2", passwordHash: "x", status: "ACTIVE" },
    });
    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: `G2 client ${randomUUID()}`, nameNormalized: `g2 client ${randomUUID()}`, status: "ACTIVE", createdBy: userId },
    });
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId, clientAccountId, userId, role: "CLIENT_MANAGER", createdBy: userId },
    });
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId,
        clientAccountId,
        legalName: `${LEGACY_SENTINEL} SAS`,
        tradeName: LEGACY_SENTINEL,
        siren: "775670417",
        siretPrincipal: "77567041700016",
        legalForm: `${LEGACY_SENTINEL}-FORME`,
        addressLine: `1 rue ${LEGACY_SENTINEL}`,
        postalCode: "75001",
        city: LEGACY_SENTINEL,
        generalEmail: `${LEGACY_SENTINEL}@legacy.test`,
        phone: "0100000000",
        createdBy: userId,
      },
    });

    await createCandidate(candidateA, NATIVE_SENTINEL, NATIVE_SENTINEL);
    await createCandidate(candidateB, NATIVE_B_SENTINEL, NATIVE_B_SENTINEL);

    newFlowTenderId = randomUUID();
    await prisma.tender.create({
      data: { id: newFlowTenderId, organizationId, clientAccountId, candidateCompanyId: candidateA, title: "G2 NEW FLOW", status: "DRAFT", tags: [], createdBy: userId },
    });
    legacyFlowTenderId = randomUUID();
    await prisma.tender.create({
      data: { id: legacyFlowTenderId, organizationId, clientAccountId, title: "G2 LEGACY FLOW", status: "DRAFT", tags: [], createdBy: userId },
    });

    checklistItemId = randomUUID();
    await prisma.tenderChecklistItem.create({
      data: { id: checklistItemId, organizationId, tenderId: newFlowTenderId, title: "Extrait Kbis", required: true, status: "TODO", type: "ADMINISTRATIVE_DOCUMENT", subjectType: "CANDIDATE" },
    });
    legacyChecklistItemId = randomUUID();
    await prisma.tenderChecklistItem.create({
      data: { id: legacyChecklistItemId, organizationId, tenderId: legacyFlowTenderId, title: "Extrait Kbis", required: true, status: "TODO", type: "ADMINISTRATIVE_DOCUMENT", subjectType: "CANDIDATE" },
    });
    // Item dont le SUJET n'est pas le candidat : il ne doit PAS exiger d'entreprise candidate.
    subcontractorItemId = randomUUID();
    await prisma.tenderChecklistItem.create({
      data: { id: subcontractorItemId, organizationId, tenderId: legacyFlowTenderId, title: "Pièce du marché", required: false, status: "TODO", type: "OTHER", subjectType: "TENDER" },
    });

    technicalMemoId = randomUUID();
    await prisma.technicalMemo.create({
      data: { id: technicalMemoId, organizationId, tenderId: newFlowTenderId, clientAccountId, templateOrigin: "TENDEROS_SYSTEM", status: "DRAFT", createdBy: userId },
    });
    technicalMemoSectionId = randomUUID();
    await prisma.technicalMemoSection.create({
      data: { id: technicalMemoSectionId, organizationId, technicalMemoId, sectionKey: "presentation", title: "Presentation", order: 1, level: 1, status: "EMPTY", createdBy: userId },
    });
    legacyMemoId = randomUUID();
    await prisma.technicalMemo.create({
      data: { id: legacyMemoId, organizationId, tenderId: legacyFlowTenderId, clientAccountId, templateOrigin: "TENDEROS_SYSTEM", status: "DRAFT", createdBy: userId },
    });
    legacyMemoSectionId = randomUUID();
    await prisma.technicalMemoSection.create({
      data: { id: legacyMemoSectionId, organizationId, technicalMemoId: legacyMemoId, sectionKey: "presentation", title: "Presentation", order: 1, level: 1, status: "EMPTY", createdBy: userId },
    });
  }, 180000);

  afterAll(async () => {
    await prisma.technicalMemoSection.deleteMany({ where: { organizationId } });
    await prisma.technicalMemo.deleteMany({ where: { organizationId } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId } });
    await prisma.companyRepresentative.deleteMany({ where: { organizationId } });
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  }, 60000);

  describe("§12 — NEW FLOW : sentinelle candidate servie, sentinelle client absente, zéro invocation", () => {
    it("DC1, DC2, mémoire technique et checklist n'invoquent JAMAIS GetCompanyProfileUseCase", async () => {
      profileCalls = [];

      const dc1 = await app.get(Dc1OfficialFormResolver).resolve({ ...actor(), tenderId: newFlowTenderId });
      // DC4 resout une ANNEXE de sous-traitance (`subcontractorDeclarationId`), jamais un Tender :
      // la mission accepte « DC2 ou DC4 », on eprouve donc DC2, qui porte bien un `tenderId`.
      const dc2 = await app.get(Dc2OfficialFormResolver).resolve({ ...actor(), tenderId: newFlowTenderId, scope: { kind: "CANDIDATE" } });

      const memo = await prisma.technicalMemo.findUniqueOrThrow({ where: { id: technicalMemoId } });
      const section = await prisma.technicalMemoSection.findUniqueOrThrow({ where: { id: technicalMemoSectionId } });
      const memoContext = await app.get(TechnicalMemoSectionContextAssembler).assemble({
        ...actor(),
        memo: memo as never,
        section: section as never,
      });

      const checklist = await app.get(FindChecklistItemDocumentMatchesUseCase).execute({
        ...actor(),
        tenderId: newFlowTenderId,
        itemId: checklistItemId,
        // `clientAccountId` est FOURNI : c'est le chemin Legacy que le NEW FLOW doit ignorer.
        clientAccountId,
        candidateCompanyId: candidateA,
      });

      const all = JSON.stringify({ dc1, dc2, memoContext, checklist });
      expect(all, "sentinelle candidate servie").toContain(NATIVE_SENTINEL);
      expect(all.split(LEGACY_SENTINEL).length - 1, "LEGACY_SENTINEL_COUNT").toBe(0);
      // La preuve la plus forte : aucune requête n'est même partie.
      expect(profileCalls, "GET_COMPANY_PROFILE_NEW_FLOW_INVOCATION_COUNT").toEqual([]);
    }, 180000);
  });

  describe("§13 — LEGACY FLOW : refus explicite, jamais de repli silencieux", () => {
    it.each([
      ["DC1", async () => app.get(Dc1OfficialFormResolver).resolve({ ...actor(), tenderId: legacyFlowTenderId })],
      ["DC2", async () => app.get(Dc2OfficialFormResolver).resolve({ ...actor(), tenderId: legacyFlowTenderId, scope: { kind: "CANDIDATE" } })],
      [
        "Mémoire technique",
        async () => {
          const memo = await prisma.technicalMemo.findUniqueOrThrow({ where: { id: legacyMemoId } });
          const section = await prisma.technicalMemoSection.findUniqueOrThrow({ where: { id: legacyMemoSectionId } });
          return app.get(TechnicalMemoSectionContextAssembler).assemble({ ...actor(), memo: memo as never, section: section as never });
        },
      ],
      [
        "Checklist (sujet CANDIDAT)",
        async () =>
          app.get(FindChecklistItemDocumentMatchesUseCase).execute({
            ...actor(),
            tenderId: legacyFlowTenderId,
            itemId: legacyChecklistItemId,
            clientAccountId,
          }),
      ],
    ])("%s : CANDIDATE_COMPANY_REQUIRED, et aucune lecture du profil client", async (_label, run) => {
      profileCalls = [];
      await expect(run()).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
      // Le refus précède toute lecture : c'est ce qui distingue un garde d'un simple filtrage.
      expect(profileCalls).toEqual([]);
    }, 180000);

    it("un item de checklist dont le SUJET n'est pas le candidat continue de fonctionner sans entreprise candidate", async () => {
      profileCalls = [];
      const result = await app.get(FindChecklistItemDocumentMatchesUseCase).execute({
        ...actor(),
        tenderId: legacyFlowTenderId,
        itemId: subcontractorItemId,
        clientAccountId,
      });

      // Aucun durcissement gratuit : la mission ne demande le candidat que là où il est requis.
      expect(result).toBeDefined();
      expect(JSON.stringify(result).split(LEGACY_SENTINEL).length - 1).toBe(0);
      expect(profileCalls).toEqual([]);
    }, 180000);
  });

  describe("§15 — bascule A → B", () => {
    it("après changement d'entreprise candidate, la résolution courante sert B et jamais A ni le client", async () => {
      profileCalls = [];
      await prisma.tender.update({ where: { id: newFlowTenderId }, data: { candidateCompanyId: candidateB } });

      const dc1 = JSON.stringify(await app.get(Dc1OfficialFormResolver).resolve({ ...actor(), tenderId: newFlowTenderId }));

      expect(dc1).toContain(NATIVE_B_SENTINEL);
      expect(dc1.split(`${NATIVE_SENTINEL} SAS`).length - 1, "A n'est plus le candidat courant").toBe(0);
      expect(dc1.split(LEGACY_SENTINEL).length - 1).toBe(0);
      expect(profileCalls).toEqual([]);

      await prisma.tender.update({ where: { id: newFlowTenderId }, data: { candidateCompanyId: candidateA } });
    }, 180000);
  });

  describe("§18 — la surface commerciale ClientAccount reste intacte", () => {
    it("le profil du client demeure lisible par sa propre surface, avec ses données inchangées", async () => {
      profileCalls = [];
      const profile = await app.get(GetCompanyProfileUseCase).execute({ ...actor(), clientAccountId });

      expect(profile.legalIdentity?.legalName).toBe(`${LEGACY_SENTINEL} SAS`);
      expect(profile.legalIdentity?.city).toBe(LEGACY_SENTINEL);
      // L'appel est bien passé : le use case n'est pas neutralisé, il n'est simplement plus
      // consulté par les consommateurs candidate-dépendants.
      expect(profileCalls).toHaveLength(1);
    }, 120000);
  });
});
