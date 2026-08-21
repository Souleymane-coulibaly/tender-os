import { describe, expect, it, vi } from "vitest";
import { ListValidatedAdministrativeDocumentsForPackageUseCase } from "./list-validated-administrative-documents-for-package.use-case";
import { AdministrativeDocument } from "../../domain/administrative-document.aggregate";
import { AdministrativeDocumentRevision } from "../../domain/administrative-document-revision.entity";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import type { AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const DOSSIER_ID = "dossier-1";
const CLIENT_ACCOUNT_ID = "client-commercial-x";
const CANDIDATE_A = "candidate-a";
const CANDIDATE_B = "candidate-b";
const NOW = new Date("2026-09-10T10:00:00.000Z");

function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => CLIENT_ACCOUNT_ID) } as unknown as AdministrativeDossierAccessService;
}

function inMemoryDossierRepository(dossier: AdministrativeDossier): AdministrativeDossierRepository {
  return { create: async () => {}, findById: async () => dossier, findByTenderId: async () => dossier, save: async () => {} };
}
function inMemoryDocumentRepository(documents: AdministrativeDocument[]): AdministrativeDocumentRepository {
  return {
    create: async () => {},
    findById: async ({ documentId }) => documents.find((d) => d.id === documentId) ?? null,
    listByDossier: async () => documents,
    findByRequirementId: async () => null,
    save: async () => {},
    existsForOrganization: async () => documents.length > 0,
  };
}
function inMemoryRevisionRepository(revisions: AdministrativeDocumentRevision[]): AdministrativeDocumentRevisionRepository {
  return {
    create: async () => {},
    findById: async ({ revisionId }) => revisions.find((r) => r.id === revisionId) ?? null,
    listByDocument: async ({ administrativeDocumentId }) => revisions.filter((r) => r.administrativeDocumentId === administrativeDocumentId),
    save: async () => {},
  };
}

/** Construit un document DC1 avec sa révision VALIDÉE, portant (ou non) une provenance candidate. */
function validatedDocumentWithRevision(input: { documentId: string; revisionId: string; candidateCompanyId: string | undefined }): { document: AdministrativeDocument; revision: AdministrativeDocumentRevision } {
  const document = AdministrativeDocument.create({ id: input.documentId, organizationId: ORGANIZATION_ID, administrativeDossierId: DOSSIER_ID, tenderId: TENDER_ID, documentType: AdministrativeDocumentType.Dc1, label: "DC1", createdBy: "user-1", occurredAt: NOW });
  const revision = AdministrativeDocumentRevision.create({ id: input.revisionId, organizationId: ORGANIZATION_ID, administrativeDocumentId: input.documentId, revisionNumber: 1, createdBy: "user-1", occurredAt: NOW });
  revision.attachDocument({ documentId: `doc-ext-${input.documentId}`, documentVersionId: "v1", documentChecksum: "abc", documentFileName: "dc1.pdf", documentMimeType: "application/pdf", candidateCompanyId: input.candidateCompanyId, occurredAt: NOW });
  revision.submitForReview(NOW);
  revision.validate(NOW);
  document.markValidated({ revisionId: revision.id, validatedBy: "user-1", occurredAt: NOW });
  return { document, revision };
}

function buildUseCase(input: { document: AdministrativeDocument; revision: AdministrativeDocumentRevision }): ListValidatedAdministrativeDocumentsForPackageUseCase {
  const dossier = AdministrativeDossier.create({ id: DOSSIER_ID, organizationId: ORGANIZATION_ID, clientAccountId: CLIENT_ACCOUNT_ID, tenderId: TENDER_ID, occurredAt: NOW });
  return new ListValidatedAdministrativeDocumentsForPackageUseCase(fakeAccessService(), inMemoryDossierRepository(dossier), inMemoryDocumentRepository([input.document]), inMemoryRevisionRepository([input.revision]));
}

/** Checkpoint TENDEROS-2.1-P2.2-F3 (ferme le gap identifié par l'audit : `TenderCandidateCompanyChanged`
 *  n'a aucun consommateur, aucune pièce administrative ne détectait un changement de candidat), resserré
 *  par Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P2, matrice §18) — preuve unitaire
 *  directe que la résolution des pièces administratives pour le Response Package respecte la
 *  CandidateCompany courante du Tender, sans jamais fabriquer de provenance pour une révision
 *  antérieure à ce checkpoint (mission §27 "ne pas casser l'historique").
 *
 *  Politique à DEUX RÉGIMES, jamais un seul comportement uniforme :
 *  - `query.candidateCompanyId === undefined` (Tender LEGACY, jamais adopté `candidateCompanyId`) :
 *    AUCUN filtrage — reste PERMISSIF pour ne jamais régresser silencieusement un dossier déjà en
 *    production (mission §27), délibérément plus permissif que `ListFinalFilesForPackageUseCase`
 *    (pricing, E1) qui retourne `[]` dans ce cas.
 *  - `query.candidateCompanyId` renseigné (Tender NEW FLOW) : STRICTE égalité requise — F3.1 a
 *    resserré cette branche pour que `revision.candidateCompanyId=NULL` ne soit PLUS un joker
 *    (matrice §18 cas D) : seule une révision capturée pour EXACTEMENT ce candidat passe. */
describe("ListValidatedAdministrativeDocumentsForPackageUseCase — Checkpoint TENDEROS-2.1-P2.2-F3 / F3.1", () => {
  it("TEST CLIENT ≠ CANDIDATE — a document validated for the Tender's current CandidateCompany (A) is resolved", async () => {
    const { document, revision } = validatedDocumentWithRevision({ documentId: "doc-1", revisionId: "rev-1", candidateCompanyId: CANDIDATE_A });
    const useCase = buildUseCase({ document, revision });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });

    expect(result).toHaveLength(1);
    expect(result[0]!.administrativeDocumentId).toBe("doc-1");
  });

  it("TEST CANDIDATE CHANGE (mission §18/§25 CRITIQUE) — a document validated while the Tender's candidate was A is never returned once the Tender's candidate is B", async () => {
    const { document, revision } = validatedDocumentWithRevision({ documentId: "doc-1", revisionId: "rev-1", candidateCompanyId: CANDIDATE_A });
    const useCase = buildUseCase({ document, revision });

    const resultForB = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_B });
    expect(resultForB).toEqual([]);

    // La même pièce reste résolue correctement pour SA candidate d'origine — jamais supprimée,
    // jamais réattribuée (historique immuable, même discipline que ResponsePackageVersion).
    const resultForA = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });
    expect(resultForA).toHaveLength(1);
  });

  it("Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P2, matrice §18 cas D) — a revision with no captured candidate provenance is EXCLUDED once the Tender has a resolved NEW FLOW candidate: NULL is never a wildcard", async () => {
    const { document, revision } = validatedDocumentWithRevision({ documentId: "doc-1", revisionId: "rev-1", candidateCompanyId: undefined });
    const useCase = buildUseCase({ document, revision });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });

    expect(result).toEqual([]);
  });

  it("TEST LEGACY TENDER — a Tender with no CandidateCompany resolved at all still resolves administrative documents exactly as before this checkpoint (no regression for dossiers that never adopted the new candidate flow)", async () => {
    const { document, revision } = validatedDocumentWithRevision({ documentId: "doc-1", revisionId: "rev-1", candidateCompanyId: CANDIDATE_A });
    const useCase = buildUseCase({ document, revision });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: undefined });

    expect(result).toHaveLength(1);
  });

  it("mission §29 — MULTI-CANDIDATE: candidate B's request never resolves a document captured for candidate A within the same organization/tender history", async () => {
    const { document, revision } = validatedDocumentWithRevision({ documentId: "doc-1", revisionId: "rev-1", candidateCompanyId: CANDIDATE_A });
    const useCase = buildUseCase({ document, revision });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_B });

    expect(result).toEqual([]);
  });
});
