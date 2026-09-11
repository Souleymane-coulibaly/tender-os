import { describe, expect, it, vi } from "vitest";
import {
  AttachAdministrativeDocumentRevisionUseCase,
  CreateAdministrativeDocumentUseCase,
  RejectAdministrativeDocumentUseCase,
  ValidateAdministrativeDocumentUseCase,
  ListTenderAdministrativeDocumentsUseCase,
} from "./administrative-document.use-cases";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import type { AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import type { AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDossierRecalculationService } from "../services/administrative-dossier-recalculation.service";
import type { GetDocumentUseCase } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeDocument } from "../../domain/administrative-document.aggregate";
import { AdministrativeDocumentRevision } from "../../domain/administrative-document-revision.entity";
import {
  AdministrativeDocumentNotReadyForValidationError,
  AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError,
} from "../../domain/errors";
import { ClientPermission } from "../../../client-portfolio";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const DOSSIER_ID = "dossier-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `rev-${(n += 1)}` };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return {
    assertTenderAccess: vi.fn(async () => "client-1"),
    loadDossierByTenderId: vi.fn(async () => ({
      dossier: { id: DOSSIER_ID, tenderId: TENDER_ID },
      clientAccountId: "client-1",
    })),
  } as unknown as AdministrativeDossierAccessService;
}
function fakeStatusRecalculation(): AdministrativeDossierRecalculationService {
  return {
    recompute: vi.fn(async () => {}),
  } as unknown as AdministrativeDossierRecalculationService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => {}) };
}
function fakeRequirementRepository(): AdministrativeRequirementRepository {
  return {
    create: async () => {},
    findById: async () => null,
    listByTender: async () => [],
    listConfirmedByTender: async () => [],
    save: async () => {},
  };
}
function fakeGetDocumentUseCase(): GetDocumentUseCase {
  return {
    execute: vi.fn(async ({ documentId }: { documentId: string }) => ({
      id: documentId,
      currentVersion: {
        id: "version-1",
        checksum: "abc123",
        sanitizedFilename: "attestation.pdf",
        mimeType: "application/pdf",
      },
    })),
  } as unknown as GetDocumentUseCase;
}
// Checkpoint TENDEROS-2.1-P2.2-F3 — par défaut un CandidateCompany résolu (comportement le plus
// courant), pour que les tests existants (qui n'exercent PAS cette provenance) restent inchangés en
// pratique tout en capturant une valeur réelle et vérifiable.
function fakeGetTenderUseCase(
  candidateCompanyId: string | undefined = "candidate-1",
): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ candidateCompanyId })) } as unknown as GetTenderUseCase;
}
function inMemoryDocumentRepository(
  seed: AdministrativeDocument[] = [],
): AdministrativeDocumentRepository {
  const rows = new Map(seed.map((d) => [d.id, d]));
  return {
    create: async (d) => void rows.set(d.id, d),
    findById: async ({ documentId }) => rows.get(documentId) ?? null,
    listByDossier: async () => [...rows.values()],
    findByRequirementId: async () => null,
    save: async (d) => void rows.set(d.id, d),
    existsForOrganization: async () => rows.size > 0,
  };
}
function inMemoryRevisionRepository(
  seed: AdministrativeDocumentRevision[] = [],
): AdministrativeDocumentRevisionRepository {
  const rows = new Map(seed.map((r) => [r.id, r]));
  return {
    create: async (r) => void rows.set(r.id, r),
    findById: async ({ revisionId }) => rows.get(revisionId) ?? null,
    listByDocument: async ({ administrativeDocumentId }) =>
      [...rows.values()]
        .filter((r) => r.administrativeDocumentId === administrativeDocumentId)
        .sort((a, b) => a.revisionNumber - b.revisionNumber),
    save: async (r) => void rows.set(r.id, r),
  };
}

function baseDocument() {
  return AdministrativeDocument.create({
    id: "doc-1",
    organizationId: ORGANIZATION_ID,
    administrativeDossierId: DOSSIER_ID,
    tenderId: TENDER_ID,
    documentType: AdministrativeDocumentType.AttestationFiscale,
    label: "Attestation fiscale",
    createdBy: "user-1",
    occurredAt: NOW,
  });
}
function draftRevision(overrides: { revisionNumber?: number } = {}) {
  return AdministrativeDocumentRevision.create({
    id: `rev-seed-${overrides.revisionNumber ?? 1}`,
    organizationId: ORGANIZATION_ID,
    administrativeDocumentId: "doc-1",
    revisionNumber: overrides.revisionNumber ?? 1,
    createdBy: "user-1",
    occurredAt: NOW,
  });
}

describe("CreateAdministrativeDocumentUseCase", () => {
  it("creates a document with an initial empty DRAFT revision", async () => {
    const documentRepository = inMemoryDocumentRepository();
    const revisionRepository = inMemoryRevisionRepository();
    const useCase = new CreateAdministrativeDocumentUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeRequirementRepository(),
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
      fakeIdGenerator(),
    );

    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      tenderId: TENDER_ID,
      documentType: AdministrativeDocumentType.AttestationFiscale,
      label: "Attestation fiscale",
    });

    expect(summary.revisions).toHaveLength(1);
    expect(summary.revisions[0]?.status).toBe("DRAFT");
    expect(summary.validatedRevisionId).toBeUndefined();
  });
});

describe("AttachAdministrativeDocumentRevisionUseCase — mission §21", () => {
  it("attaches a verified document to the existing DRAFT revision and submits it for review", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const getDocumentUseCase = fakeGetDocumentUseCase();
    const statusRecalculation = fakeStatusRecalculation();
    const useCase = new AttachAdministrativeDocumentRevisionUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      getDocumentUseCase,
      fakeGetTenderUseCase(),
      fakeAuditLogWriter(),
      statusRecalculation,
      fakeClock(),
      fakeIdGenerator(),
    );

    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      documentId: "doc-ext-1",
    });

    expect(summary.revisions).toHaveLength(1);
    expect(summary.revisions[0]?.status).toBe("IN_REVIEW");
    expect(summary.revisions[0]?.documentChecksum).toBe("abc123");
    expect(statusRecalculation.recompute).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      dossierId: DOSSIER_ID,
    });
  });

  it("Checkpoint TENDEROS-2.1-P2.2-F3 — captures the Tender's effective CandidateCompany at attach time, never guessed, undefined for a Tender without a resolved candidate", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const useCase = new AttachAdministrativeDocumentRevisionUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeGetDocumentUseCase(),
      fakeGetTenderUseCase("candidate-A"),
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
      fakeIdGenerator(),
    );

    await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      documentId: "doc-ext-1",
    });

    const persisted = await revisionRepository.listByDocument({
      organizationId: ORGANIZATION_ID,
      administrativeDocumentId: "doc-1",
    });
    expect(persisted[0]?.candidateCompanyId).toBe("candidate-A");
  });

  it("Checkpoint TENDEROS-2.1-P2.2-F3 — re-evaluates the candidate on EVERY attach, never frozen on the first one: a second attach (which submits the prior revision for review, so it creates a NEW revision rather than reusing it) captures the candidate current AT THAT INSTANT, and the earlier revision's own candidate is never rewritten", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    // Première pièce jointe : candidat A. `attachDocument` appelle ensuite `submitForReview` —
    // la révision quitte l'état DRAFT, donc un second attach ne peut PLUS la réutiliser (mission
    // "jamais une réécriture d'une révision non-DRAFT") : il en crée une NOUVELLE.
    const useCaseA = new AttachAdministrativeDocumentRevisionUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeGetDocumentUseCase(),
      fakeGetTenderUseCase("candidate-A"),
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
      fakeIdGenerator(),
    );
    await useCaseA.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      documentId: "doc-ext-1",
    });

    const useCaseB = new AttachAdministrativeDocumentRevisionUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeGetDocumentUseCase(),
      fakeGetTenderUseCase("candidate-B"),
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
      fakeIdGenerator(),
    );
    await useCaseB.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      documentId: "doc-ext-2",
    });

    const persisted = await revisionRepository.listByDocument({
      organizationId: ORGANIZATION_ID,
      administrativeDocumentId: "doc-1",
    });
    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.candidateCompanyId).toBe("candidate-A"); // révision d'origine, jamais réécrite
    expect(persisted[1]?.candidateCompanyId).toBe("candidate-B"); // nouvelle révision, candidat réévalué
  });

  it("creates a NEW revision (never mutating) when the latest revision is already validated, and clears the prior validation", async () => {
    const document = baseDocument();
    const validated = draftRevision();
    validated.attachDocument({
      documentId: "doc-ext-1",
      documentVersionId: "v1",
      documentChecksum: "abc",
      documentFileName: "f.pdf",
      documentMimeType: "application/pdf",
      occurredAt: NOW,
    });
    validated.submitForReview(NOW);
    validated.validate(NOW);
    document.markValidated({ revisionId: validated.id, validatedBy: "user-1", occurredAt: NOW });

    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([validated]);
    const useCase = new AttachAdministrativeDocumentRevisionUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeGetDocumentUseCase(),
      fakeGetTenderUseCase(),
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
      fakeIdGenerator(),
    );

    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      documentId: "doc-ext-2",
    });

    expect(summary.revisions).toHaveLength(2);
    expect(summary.revisions[0]?.status).toBe("REPLACED");
    expect(summary.revisions[1]?.status).toBe("IN_REVIEW");
    expect(summary.validatedRevisionId).toBeUndefined();
  });
});

describe("ValidateAdministrativeDocumentUseCase — mission §21 'révision exacte'", () => {
  it("pins the exact revisionId as validated", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    revision.attachDocument({
      documentId: "doc-ext-1",
      documentVersionId: "v1",
      documentChecksum: "abc",
      documentFileName: "f.pdf",
      documentMimeType: "application/pdf",
      occurredAt: NOW,
    });
    revision.submitForReview(NOW);
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const useCase = new ValidateAdministrativeDocumentUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
    );

    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-2",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      revisionId: revision.id,
    });

    expect(summary.validatedRevisionId).toBe(revision.id);
    expect(summary.revisions[0]?.status).toBe("VALIDATED");
  });

  it("refuses to validate a revision with no attached file", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const useCase = new ValidateAdministrativeDocumentUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
    );

    await expect(
      useCase.execute({
        organizationId: ORGANIZATION_ID,
        actorId: "user-2",
        actorRole: "OWNER",
        administrativeDocumentId: "doc-1",
        revisionId: revision.id,
      }),
    ).rejects.toBeInstanceOf(AdministrativeDocumentNotReadyForValidationError);
  });

  it("refuses to validate a DIFFERENT revision while one is already validated", async () => {
    const document = baseDocument();
    const validated = draftRevision({ revisionNumber: 1 });
    validated.attachDocument({
      documentId: "doc-ext-1",
      documentVersionId: "v1",
      documentChecksum: "abc",
      documentFileName: "f.pdf",
      documentMimeType: "application/pdf",
      occurredAt: NOW,
    });
    validated.submitForReview(NOW);
    validated.validate(NOW);
    document.markValidated({ revisionId: validated.id, validatedBy: "user-1", occurredAt: NOW });

    const other = draftRevision({ revisionNumber: 2 });
    other.attachDocument({
      documentId: "doc-ext-2",
      documentVersionId: "v2",
      documentChecksum: "def",
      documentFileName: "g.pdf",
      documentMimeType: "application/pdf",
      occurredAt: NOW,
    });
    other.submitForReview(NOW);

    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([validated, other]);
    const useCase = new ValidateAdministrativeDocumentUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeAuditLogWriter(),
      fakeStatusRecalculation(),
      fakeClock(),
    );

    await expect(
      useCase.execute({
        organizationId: ORGANIZATION_ID,
        actorId: "user-2",
        actorRole: "OWNER",
        administrativeDocumentId: "doc-1",
        revisionId: other.id,
      }),
    ).rejects.toBeInstanceOf(AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError);
  });
});

describe("RejectAdministrativeDocumentUseCase", () => {
  it("rejects the specified revision without touching the document's validation", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    revision.attachDocument({
      documentId: "doc-ext-1",
      documentVersionId: "v1",
      documentChecksum: "abc",
      documentFileName: "f.pdf",
      documentMimeType: "application/pdf",
      occurredAt: NOW,
    });
    revision.submitForReview(NOW);
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const statusRecalculation = fakeStatusRecalculation();
    const useCase = new RejectAdministrativeDocumentUseCase(
      fakeAccessService(),
      documentRepository,
      revisionRepository,
      fakeAuditLogWriter(),
      statusRecalculation,
      fakeClock(),
    );

    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-2",
      actorRole: "OWNER",
      administrativeDocumentId: "doc-1",
      revisionId: revision.id,
    });

    expect(summary.revisions[0]?.status).toBe("REJECTED");
    expect(summary.validatedRevisionId).toBeUndefined();
    expect(statusRecalculation.recompute).toHaveBeenCalled();
  });
});

describe("ListTenderAdministrativeDocumentsUseCase — source du sélecteur « document preuve »", () => {
  const query = {
    organizationId: ORGANIZATION_ID,
    actorId: "user-1",
    actorRole: "CONTRIBUTOR",
    tenderId: TENDER_ID,
  };
  const kbis = {
    id: "adoc-1",
    label: "Kbis",
    documentType: "K_BIS_OR_EQUIVALENT",
    validatedRevisionId: "rev-1",
    signatureStatus: "NOT_REQUIRED",
  } as unknown as AdministrativeDocument;
  const urssaf = {
    id: "adoc-2",
    label: "Attestation URSSAF",
    documentType: "ATTESTATION_SOCIALE",
    validatedRevisionId: undefined,
    signatureStatus: "NOT_REQUIRED",
  } as unknown as AdministrativeDocument;

  function setup(options: { dossier?: { id: string } | null; denied?: boolean } = {}) {
    const findByTenderId = vi.fn(async () =>
      options.dossier === undefined ? { id: DOSSIER_ID } : options.dossier,
    );
    const listByDossier = vi.fn(async () => [kbis, urssaf]);
    const assertTenderAccess = vi.fn(async () => {
      if (options.denied) throw new Error("accès refusé");
    });
    const useCase = new ListTenderAdministrativeDocumentsUseCase(
      { assertTenderAccess } as unknown as AdministrativeDossierAccessService,
      { findByTenderId } as unknown as AdministrativeDossierRepository,
      { listByDossier } as unknown as AdministrativeDocumentRepository,
    );
    return { useCase, findByTenderId, listByDossier, assertTenderAccess };
  }

  it("vérifie l'accès AVANT toute lecture : refusé, aucun dépôt n'est interrogé", async () => {
    const { useCase, findByTenderId, listByDossier } = setup({ denied: true });

    await expect(useCase.execute(query)).rejects.toThrow("accès refusé");
    expect(findByTenderId).not.toHaveBeenCalled();
    expect(listByDossier).not.toHaveBeenCalled();
  });

  it("exige la permission de LECTURE du dossier administratif, sur l'appel d'offres demandé", async () => {
    const { useCase, assertTenderAccess } = setup();

    await useCase.execute(query);
    expect(assertTenderAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tenderId: TENDER_ID,
        permission: ClientPermission.ReadAdministrativeDossier,
      }),
    );
  });

  it("liste les documents du dossier en éléments légers, sans révisions", async () => {
    const { useCase, listByDossier } = setup();

    const result = await useCase.execute(query);
    expect(listByDossier).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      administrativeDossierId: DOSSIER_ID,
    });
    expect(result).toEqual([
      {
        id: "adoc-1",
        label: "Kbis",
        documentType: "K_BIS_OR_EQUIVALENT",
        validatedRevisionId: "rev-1",
        signatureStatus: "NOT_REQUIRED",
      },
      {
        id: "adoc-2",
        label: "Attestation URSSAF",
        documentType: "ATTESTATION_SOCIALE",
        signatureStatus: "NOT_REQUIRED",
      },
    ]);
  });

  it("renvoie une liste vide quand l'appel d'offres n'a pas encore de dossier", async () => {
    const { useCase, listByDossier } = setup({ dossier: null });

    expect(await useCase.execute(query)).toEqual([]);
    expect(listByDossier).not.toHaveBeenCalled();
  });
});
