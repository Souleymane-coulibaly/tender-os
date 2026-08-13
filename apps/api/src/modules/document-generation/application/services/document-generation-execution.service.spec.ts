import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import type { CreateDocumentWithFirstVersionUseCase, DocumentVersionRepository, InternalDocumentCleanupService, StorageProvider } from "../../../documents";
import { DocumentTemplateVersion } from "../../domain/document-template-version.entity";
import { GeneratedDocumentRevisionStatus } from "../../domain/generated-document-revision-status";
import type { DocxMergeEngine } from "../ports/docx-merge-engine";
import type { DocumentTemplateRepository } from "../ports/document-template.repository";
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
 * Sprint 21 (hardening) — `run()` est désormais une fonction PURE côté persistance de la révision :
 * elle ne l'écrit plus jamais elle-même (voir le commentaire de la classe). La compensation d'un
 * artefact orphelin (ancien correctif audit Codex P2) est relocalisée au niveau des appelants
 * (`GenerateDocumentUseCase`/`RegenerateDocumentUseCase`, voir leurs specs dédiées) puisque c'est
 * désormais LEUR persistance finale qui peut échouer après que `run()` ait déjà créé l'artefact.
 */
describe("DocumentGenerationExecutionService", () => {
  it("never persists the revision itself — returns a COMPLETED revision referencing the created artifact, without calling any repository write", async () => {
    const activeVersion = buildActiveVersion();

    const templateRepository: Pick<DocumentTemplateRepository, "findActiveVersion"> = {
      findActiveVersion: vi.fn().mockResolvedValue(activeVersion),
    };
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
    const purgeJustCreatedDocument = vi.fn();
    const internalDocumentCleanupService: Pick<InternalDocumentCleanupService, "purgeJustCreatedDocument"> = { purgeJustCreatedDocument };
    const clock: Clock = { now: () => new Date("2026-08-05T00:00:00Z") };
    const idGenerator: IdGenerator = { generate: () => "revision-1" };

    const service = new DocumentGenerationExecutionService(
      templateRepository as DocumentTemplateRepository,
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

    expect(revision.status).toBe(GeneratedDocumentRevisionStatus.Completed);
    expect(revision.artifactDocumentId).toBe("artifact-document-1");
    expect(revision.artifactDocumentVersionId).toBe("artifact-version-1");
    // Jamais purgé sur le chemin de succès — l'artefact reste rattaché à la révision retournée.
    expect(purgeJustCreatedDocument).not.toHaveBeenCalled();
  });

  it("never calls purgeJustCreatedDocument when the failure happens BEFORE any artifact was created", async () => {
    const activeVersion = buildActiveVersion();

    const templateRepository: Pick<DocumentTemplateRepository, "findActiveVersion"> = {
      findActiveVersion: vi.fn().mockResolvedValue(activeVersion),
    };
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
