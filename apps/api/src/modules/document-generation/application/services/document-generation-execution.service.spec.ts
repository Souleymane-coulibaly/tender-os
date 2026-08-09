import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import type { CreateDocumentWithFirstVersionUseCase, DocumentVersionRepository, InternalDocumentCleanupService, StorageProvider } from "../../../documents";
import { DocumentTemplateVersion } from "../../domain/document-template-version.entity";
import { GeneratedDocumentRevisionStatus } from "../../domain/generated-document-revision-status";
import type { DocxMergeEngine } from "../ports/docx-merge-engine";
import type { DocumentTemplateRepository } from "../ports/document-template.repository";
import type { GeneratedDocumentRepository } from "../ports/generated-document.repository";
import { DocumentGenerationExecutionService } from "./document-generation-execution.service";

function buildActiveVersion(): DocumentTemplateVersion {
  const version = DocumentTemplateVersion.create({
    id: "template-version-1",
    organizationId: "org-1",
    documentTemplateId: "template-1",
    version: 1,
    sourceDocumentId: "source-doc-1",
    sourceDocumentVersionId: "source-version-1",
    sourceChecksum: "checksum-1",
    discoveredPlaceholders: [{ fieldKey: "tender.reference", occurrences: 1 }],
    allowPartialGeneration: true,
    fieldMappings: [{ fieldKey: "tender.reference", label: "Référence", fieldType: "STRING", required: false }],
    createdBy: "user-1",
    occurredAt: new Date("2026-08-01T00:00:00Z"),
  });
  version.activate(new Date("2026-08-01T00:00:01Z"));
  return version;
}

/**
 * Correctif audit Codex P2 — preuve que l'artefact `Document` créé avec succès juste avant qu'une
 * étape ultérieure (ici `createRevision`) échoue est bien compensé (purgé), jamais laissé orphelin
 * et non tracé. Testé en isolation (fakes) car reproduire cet ordonnancement précis via une vraie
 * transaction Postgres nécessiterait une injection de faute non disponible dans ce dépôt.
 */
describe("DocumentGenerationExecutionService — compensation d'un artefact orphelin (correctif audit Codex P2)", () => {
  it("purges the just-created artifact Document when createRevision fails right after artifact creation, and persists a FAILED revision with no artifact reference", async () => {
    const activeVersion = buildActiveVersion();

    const templateRepository: Pick<DocumentTemplateRepository, "findActiveVersion"> = {
      findActiveVersion: vi.fn().mockResolvedValue(activeVersion),
    };

    const createRevision = vi.fn();
    let callCount = 0;
    createRevision.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("simulated DB failure right after the artifact was committed");
      }
    });
    const generatedDocumentRepository: Pick<GeneratedDocumentRepository, "createRevision"> = { createRevision };

    const mergeEngine: Pick<DocxMergeEngine, "render"> = { render: vi.fn().mockReturnValue(Buffer.from("fake-docx-bytes")) };

    const documentVersionRepository: Pick<DocumentVersionRepository, "findById"> = {
      findById: vi.fn().mockResolvedValue({ storageKey: "org-1/source-doc-1/source-version-1.docx" }),
    };

    const storageProvider: Pick<StorageProvider, "openReadStream"> = {
      openReadStream: vi.fn().mockResolvedValue(Readable.from([Buffer.from("template-bytes")])),
    };

    const createDocumentWithFirstVersionUseCase: Pick<CreateDocumentWithFirstVersionUseCase, "execute"> = {
      execute: vi.fn().mockResolvedValue({ id: "artifact-document-1", currentVersion: { id: "artifact-version-1" } }),
    };

    const purgeJustCreatedDocument = vi.fn().mockResolvedValue(undefined);
    const internalDocumentCleanupService: Pick<InternalDocumentCleanupService, "purgeJustCreatedDocument"> = { purgeJustCreatedDocument };

    const clock: Clock = { now: () => new Date("2026-08-05T00:00:00Z") };
    const idGenerator: IdGenerator = { generate: () => "revision-1" };

    const service = new DocumentGenerationExecutionService(
      templateRepository as DocumentTemplateRepository,
      generatedDocumentRepository as GeneratedDocumentRepository,
      mergeEngine as DocxMergeEngine,
      documentVersionRepository as DocumentVersionRepository,
      storageProvider as StorageProvider,
      createDocumentWithFirstVersionUseCase as CreateDocumentWithFirstVersionUseCase,
      internalDocumentCleanupService as InternalDocumentCleanupService,
      clock,
      idGenerator,
    );

    const revision = await service.run({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      generatedDocumentId: "generated-doc-1",
      documentTemplateId: "template-1",
      revisionNumber: 1,
      data: { "tender.reference": "AO-1" },
      documentTitle: "Document de test",
    });

    // L'artefact CRÉÉ AVEC SUCCÈS a bien été purgé — jamais un Document orphelin non référencé.
    expect(purgeJustCreatedDocument).toHaveBeenCalledTimes(1);
    expect(purgeJustCreatedDocument).toHaveBeenCalledWith({ organizationId: "org-1", documentId: "artifact-document-1" });

    // La révision persistée est FAILED, sans référence à l'artefact purgé (il n'existe plus).
    expect(revision.status).toBe(GeneratedDocumentRevisionStatus.Failed);
    expect(revision.artifactDocumentId).toBeUndefined();
    expect(revision.artifactDocumentVersionId).toBeUndefined();

    // La révision FAILED a bien été persistée (deuxième appel à createRevision, après l'échec du premier).
    expect(createRevision).toHaveBeenCalledTimes(2);
  });

  it("never calls purgeJustCreatedDocument when the failure happens BEFORE any artifact was created", async () => {
    const activeVersion = buildActiveVersion();

    const templateRepository: Pick<DocumentTemplateRepository, "findActiveVersion"> = {
      findActiveVersion: vi.fn().mockResolvedValue(activeVersion),
    };
    const generatedDocumentRepository: Pick<GeneratedDocumentRepository, "createRevision"> = { createRevision: vi.fn().mockResolvedValue(undefined) };
    const mergeEngine: Pick<DocxMergeEngine, "render"> = { render: vi.fn() };
    // Le fichier source du template est introuvable — échec AVANT toute création d'artefact.
    const documentVersionRepository: Pick<DocumentVersionRepository, "findById"> = { findById: vi.fn().mockResolvedValue(null) };
    const storageProvider: Pick<StorageProvider, "openReadStream"> = { openReadStream: vi.fn() };
    const createDocumentWithFirstVersionUseCase: Pick<CreateDocumentWithFirstVersionUseCase, "execute"> = { execute: vi.fn() };
    const purgeJustCreatedDocument = vi.fn();
    const internalDocumentCleanupService: Pick<InternalDocumentCleanupService, "purgeJustCreatedDocument"> = { purgeJustCreatedDocument };
    const clock: Clock = { now: () => new Date("2026-08-05T00:00:00Z") };
    const idGenerator: IdGenerator = { generate: () => "revision-1" };

    const service = new DocumentGenerationExecutionService(
      templateRepository as DocumentTemplateRepository,
      generatedDocumentRepository as GeneratedDocumentRepository,
      mergeEngine as DocxMergeEngine,
      documentVersionRepository as DocumentVersionRepository,
      storageProvider as StorageProvider,
      createDocumentWithFirstVersionUseCase as CreateDocumentWithFirstVersionUseCase,
      internalDocumentCleanupService as InternalDocumentCleanupService,
      clock,
      idGenerator,
    );

    const revision = await service.run({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      generatedDocumentId: "generated-doc-1",
      documentTemplateId: "template-1",
      revisionNumber: 1,
      data: { "tender.reference": "AO-1" },
      documentTitle: "Document de test",
    });

    expect(purgeJustCreatedDocument).not.toHaveBeenCalled();
    expect(revision.status).toBe(GeneratedDocumentRevisionStatus.Failed);
  });
});
