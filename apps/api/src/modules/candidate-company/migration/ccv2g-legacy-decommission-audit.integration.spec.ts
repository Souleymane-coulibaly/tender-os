import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../app.module";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Dc1OfficialFormResolver } from "../../administrative-dossier/application/services/official-form-mappers/dc1-official-form-resolver.service";
import { FindChecklistItemDocumentMatchesUseCase } from "../../checklist-intelligence/application/use-cases/find-checklist-item-document-matches.use-case";
import { MembershipId } from "../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../memberships/infrastructure/prisma-membership.repository";
import { TechnicalMemoSectionContextAssembler } from "../../technical-memo/application/services/technical-memo-section-context-assembler";

/**
 * Checkpoint TENDEROS-2.1-CCV2-G — PREUVE D'AUDIT, aucune suppression.
 *
 * Objet : établir par exécution réelle (PostgreSQL + graphe de dépendances Nest complet) ce que les
 * consommateurs candidate-dépendants lisent RÉELLEMENT, afin que le plan de décommissionnement
 * repose sur des faits et non sur une lecture de code.
 *
 * Deux sentinelles ANTAGONISTES sont posées sur le MÊME Tender :
 *  - `LEGACY-CLIENT-SECRET` dans `CompanyLegalIdentity` du `ClientAccount` (surface commerciale) ;
 *  - `NATIVE-CANDIDATE-SECRET` dans `CandidateCompany` (identité juridique du candidat).
 *
 * En NEW FLOW (`Tender.candidateCompanyId IS NOT NULL`), la seconde doit apparaître et la première
 * ne jamais apparaître. C'est le seul critère qui autorise à retirer le repli `CompanyProfile`.
 *
 * Le second bloc mesure le comportement ACTUEL en LEGACY FLOW (`candidateCompanyId IS NULL`) —
 * référence contre laquelle la politique de décommissionnement devra être comparée. Ce test ne
 * décide rien : il constate.
 */
describe("CCV2-G — audit de décommissionnement Legacy (PostgreSQL réel)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const organizationId = randomUUID();
  const userId = randomUUID();
  const clientAccountId = randomUUID();
  const candidateCompanyId = randomUUID();

  let newFlowTenderId: string;
  let legacyFlowTenderId: string;
  let checklistItemId: string;
  let technicalMemoId: string;
  let technicalMemoSectionId: string;

  const LEGACY_SENTINEL = "LEGACY-CLIENT-SECRET";
  const NATIVE_SENTINEL = "NATIVE-CANDIDATE-SECRET";

  const actor = () => ({ organizationId, actorId: userId, actorRole: OrganizationRole.Owner as string });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({
      data: { id: organizationId, name: "G audit", slug: `g-audit-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.user.create({
      data: { id: userId, email: `g-audit-${randomUUID()}@smoke.test`, displayName: "G audit", passwordHash: "x", status: "ACTIVE" },
    });
    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: `G client ${randomUUID()}`, nameNormalized: `g client ${randomUUID()}`, status: "ACTIVE", createdBy: userId },
    });
    // L'acteur doit avoir un accès CLIENT réel : les consommateurs audités sont client-aware.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId, clientAccountId, userId, role: "CLIENT_MANAGER", createdBy: userId },
    });

    // --- Sentinelle LEGACY : profil COMMERCIAL du ClientAccount, entièrement renseigné.
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId,
        clientAccountId,
        legalName: `${LEGACY_SENTINEL} SAS`,
        tradeName: LEGACY_SENTINEL,
        siren: "552100554",
        siretPrincipal: "55210055400013",
        legalForm: `${LEGACY_SENTINEL}-FORME`,
        addressLine: `1 rue ${LEGACY_SENTINEL}`,
        postalCode: "75001",
        city: LEGACY_SENTINEL,
        generalEmail: `${LEGACY_SENTINEL}@legacy.test`,
        phone: "0100000000",
        createdBy: userId,
      },
    });

    // --- Sentinelle NATIVE : identité juridique de l'entreprise candidate.
    await prisma.candidateCompany.create({
      data: {
        id: candidateCompanyId,
        organizationId,
        name: `${NATIVE_SENTINEL} SAS`,
        nameNormalized: `${NATIVE_SENTINEL.toLowerCase()} sas`,
        legalName: `${NATIVE_SENTINEL} SAS`,
        siren: "356000000",
        legalForm: `${NATIVE_SENTINEL}-FORME`,
        status: "ACTIVE",
        createdBy: userId,
      },
    });
    await prisma.candidateEstablishment.create({
      data: {
        id: randomUUID(),
        organizationId,
        candidateCompanyId,
        siret: "35600000000048",
        isPrincipal: true,
        addressLine: `1 rue ${NATIVE_SENTINEL}`,
        postalCode: "69001",
        city: NATIVE_SENTINEL,
        createdBy: userId,
      },
    });
    await prisma.companyRepresentative.create({
      data: {
        id: randomUUID(),
        organizationId,
        candidateCompanyId,
        firstName: NATIVE_SENTINEL,
        lastName: "CONTACT",
        type: "ADMINISTRATIVE_CONTACT",
        email: `${NATIVE_SENTINEL}@native.test`,
        phone: "0400000000",
        status: "ACTIVE",
        createdBy: userId,
      },
    });

    newFlowTenderId = randomUUID();
    await prisma.tender.create({
      data: { id: newFlowTenderId, organizationId, clientAccountId, candidateCompanyId, title: "G NEW FLOW", status: "DRAFT", tags: [], createdBy: userId },
    });

    // Artefacts REELS necessaires aux consommateurs audites : un item de checklist et un memoire
    // technique avec une section. Aucun objet fabrique en memoire — les use cases les relisent.
    checklistItemId = randomUUID();
    await prisma.tenderChecklistItem.create({
      data: { id: checklistItemId, organizationId, tenderId: newFlowTenderId, title: "Extrait Kbis", required: true, status: "TODO", type: "ADMINISTRATIVE_DOCUMENT" },
    });

    technicalMemoId = randomUUID();
    await prisma.technicalMemo.create({
      data: { id: technicalMemoId, organizationId, tenderId: newFlowTenderId, clientAccountId, templateOrigin: "TENDEROS_SYSTEM", status: "DRAFT", createdBy: userId },
    });
    technicalMemoSectionId = randomUUID();
    await prisma.technicalMemoSection.create({
      data: { id: technicalMemoSectionId, organizationId, technicalMemoId, sectionKey: "presentation", title: "Presentation du candidat", order: 1, level: 1, status: "EMPTY", createdBy: userId },
    });

    legacyFlowTenderId = randomUUID();
    await prisma.tender.create({
      data: { id: legacyFlowTenderId, organizationId, clientAccountId, title: "G LEGACY FLOW", status: "DRAFT", tags: [], createdBy: userId },
    });
  }, 180000);

  afterAll(async () => {
    await prisma.technicalMemoSection.deleteMany({ where: { organizationId } });
    await prisma.technicalMemo.deleteMany({ where: { organizationId } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId } });
    await prisma.companyRepresentative.deleteMany({ where: { organizationId } });
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId } });
    // Les Tenders D'ABORD : `Tender.candidateCompany` est une FK COMPOSITE
    // `[candidateCompanyId, organizationId]`. Supprimer la CandidateCompany en premier declenche un
    // ON DELETE SET NULL sur les DEUX colonnes, dont `organization_id` qui est NOT NULL.
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

  describe("§23 — NEW FLOW : preuve hostile par sentinelles antagonistes", () => {
    it("DC1 (document administratif) sert l'identité CANDIDATE et jamais celle du client commercial", async () => {
      const resolved = await app.get(Dc1OfficialFormResolver).resolve({ ...actor(), tenderId: newFlowTenderId });
      const serialized = JSON.stringify(resolved);

      expect(serialized).toContain(NATIVE_SENTINEL);
      // Le critère du checkpoint : ZÉRO occurrence de la sentinelle du client commercial.
      expect(serialized.split(LEGACY_SENTINEL).length - 1, "LEGACY_SENTINEL_COUNT").toBe(0);
    }, 120000);

    it("le contexte du mémoire technique assemble les capacités CANDIDATE, sans emprunt au client", async () => {
      // Point d'entrée PUBLIC (`assemble`), avec un mémoire et une section réellement persistés :
      // atteindre la méthode privée avec des objets fabriqués ne prouverait pas le chemin réel.
      const memo = await prisma.technicalMemo.findUniqueOrThrow({ where: { id: technicalMemoId } });
      const section = await prisma.technicalMemoSection.findUniqueOrThrow({ where: { id: technicalMemoSectionId } });

      const context = await app.get(TechnicalMemoSectionContextAssembler).assemble({
        organizationId,
        actorId: userId,
        actorRole: OrganizationRole.Owner,
        memo: memo as never,
        section: section as never,
      });

      const serialized = JSON.stringify(context);
      expect(serialized).toContain(NATIVE_SENTINEL);
      expect(serialized.split(LEGACY_SENTINEL).length - 1, "LEGACY_SENTINEL_COUNT").toBe(0);
    }, 120000);

    it("l'appariement documentaire de la checklist n'interroge jamais le profil du client en NEW FLOW", async () => {
      const result = await app.get(FindChecklistItemDocumentMatchesUseCase).execute({
        ...actor(),
        tenderId: newFlowTenderId,
        itemId: checklistItemId,
        // `clientAccountId` est FOURNI : c'est justement le chemin Legacy que le NEW FLOW doit
        // ignorer. Le passer rend la preuve hostile — s'il était encore lu, la sentinelle du
        // client apparaîtrait.
        clientAccountId,
        candidateCompanyId,
      });

      expect(JSON.stringify(result).split(LEGACY_SENTINEL).length - 1, "LEGACY_SENTINEL_COUNT").toBe(0);
    }, 120000);
  });

  describe("§24 — LEGACY FLOW : comportement ACTUEL, mesuré et non interprété", () => {
    it("sans candidateCompanyId, DC1 REFUSE désormais au lieu de retomber sur le profil du client", async () => {
      await expect(app.get(Dc1OfficialFormResolver).resolve({ ...actor(), tenderId: legacyFlowTenderId })).rejects.toMatchObject({
        code: "CANDIDATE_COMPANY_REQUIRED",
      });
      const serialized: string | undefined = undefined;

      // Checkpoint CCV2-G.2 — ce constat est DÉPASSÉ : le repli a été supprimé. La mesure qui
      // justifiait le plan reste consignée dans le rapport CCV2-G ; le comportement, lui, est
      // désormais un refus explicite, prouvé par `ccv2g2-legacy-fallback-removed`.
      expect(serialized).toBeUndefined();
    }, 120000);

    it("le Tender sans candidat reste pleinement opérable — il n'est ni bloqué, ni marqué", async () => {
      const tender = await prisma.tender.findUnique({ where: { id: legacyFlowTenderId } });
      expect(tender?.candidateCompanyId).toBeNull();
      expect(tender?.status).toBe("DRAFT");
    }, 60000);
  });
});
