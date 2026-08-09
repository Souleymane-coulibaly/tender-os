import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import {
  CreateDocumentWithFirstVersionUseCase,
  DocumentDomain,
  DocumentOrigin,
  DOCUMENT_VERSION_REPOSITORY,
  InternalDocumentCleanupService,
  STORAGE_PROVIDER,
  type DocumentVersionRepository,
  type StorageProvider,
} from "../../../documents";
import type { FieldProvenanceEntry } from "../../domain/field-provenance";
import { GeneratedDocumentRevision } from "../../domain/generated-document-revision.entity";
import { DocxMergeError, NoActiveDocumentTemplateVersionError, RequiredFieldsMissingError } from "../../domain/errors";
import { DOCX_MERGE_ENGINE, type DocxMergeEngine } from "../ports/docx-merge-engine";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";
import { GENERATED_DOCUMENT_REPOSITORY, type GeneratedDocumentRepository } from "../ports/generated-document.repository";
import { formatDataSnapshot } from "./field-value-formatter";

const GENERATED_DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_GENERATED_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export type ProvenanceOverride = Readonly<{ sourceEntityType?: string | undefined; sourceEntityId?: string | undefined; sourceEntityVersion?: string | undefined; valuePath?: string | undefined }>;

export type RunGenerationInput = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  generatedDocumentId: string;
  documentTemplateId: string;
  previousRevisionId?: string | undefined;
  revisionNumber: number;
  data: Readonly<Record<string, unknown>>;
  provenanceOverrides?: Readonly<Record<string, ProvenanceOverride>> | undefined;
  documentTitle: string;
  requestId?: string | undefined;
}>;

/**
 * Cœur d'exécution d'UNE tentative de génération — partagé par `GenerateDocumentUseCase` (première
 * révision d'une nouvelle lignée) et `RegenerateDocumentUseCase` (révision suivante d'une lignée
 * existante), jamais dupliqué. Résout la version ACTIVE du template EXPLICITEMENT à cet instant
 * (mission "templateVersionId figé au lancement, jamais template.currentVersion résolu
 * implicitement plus tard") et fige le `dataSnapshot` fourni par l'appelant — un futur changement
 * des entités sources ne peut jamais altérer une révision déjà créée.
 */
@Injectable()
export class DocumentGenerationExecutionService {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(GENERATED_DOCUMENT_REPOSITORY) private readonly generatedDocumentRepository: GeneratedDocumentRepository,
    @Inject(DOCX_MERGE_ENGINE) private readonly mergeEngine: DocxMergeEngine,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly internalDocumentCleanupService: InternalDocumentCleanupService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async run(input: RunGenerationInput): Promise<GeneratedDocumentRevision> {
    const activeVersion = await this.templateRepository.findActiveVersion({ organizationId: input.organizationId, documentTemplateId: input.documentTemplateId });
    if (!activeVersion) {
      throw new NoActiveDocumentTemplateVersionError();
    }

    const providedKeys = new Set(Object.keys(input.data).filter((key) => input.data[key] !== undefined && input.data[key] !== null));
    const missingFields = activeVersion.computeMissingRequiredFields(providedKeys);
    if (missingFields.length > 0 && !activeVersion.allowPartialGeneration) {
      throw new RequiredFieldsMissingError(missingFields);
    }

    const provenance: readonly FieldProvenanceEntry[] = activeVersion.fieldMappings.map((mapping) => ({
      fieldKey: mapping.fieldKey,
      provided: providedKeys.has(mapping.fieldKey),
      ...(input.provenanceOverrides?.[mapping.fieldKey] ?? {}),
    }));

    const occurredAt = this.clock.now();
    const revisionId = this.idGenerator.generate();
    // Correctif audit Codex P2 — trace du Document artefact créé avec succès, pour compensation
    // s'il devait s'avérer orphelin (voir catch ci-dessous) : jamais un fichier/Document non tracé
    // qu'aucune GeneratedDocumentRevision ne référence.
    let createdArtifactDocumentId: string | undefined;

    try {
      const sourceVersion = await this.documentVersionRepository.findById({
        organizationId: input.organizationId,
        documentId: activeVersion.sourceDocumentId,
        versionId: activeVersion.sourceDocumentVersionId,
      });
      if (!sourceVersion) {
        throw new DocxMergeError("the template's source file could not be found in storage");
      }

      const templateBuffer = await readStreamToBuffer(await this.storageProvider.openReadStream(sourceVersion.storageKey));
      const formattedData = formatDataSnapshot(activeVersion.fieldMappings, input.data);
      const outputBuffer = this.mergeEngine.render({ templateBuffer, data: formattedData });

      const artifact = await this.createDocumentWithFirstVersionUseCase.execute({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        title: input.documentTitle,
        origin: DocumentOrigin.Generated,
        domain: DocumentDomain.Generated,
        file: { buffer: outputBuffer, originalFilename: `${input.documentTitle}.docx`, mimeType: GENERATED_DOCX_MIME_TYPE },
        maxFileSizeBytes: MAX_GENERATED_FILE_SIZE_BYTES,
        requestId: input.requestId,
      });
      createdArtifactDocumentId = artifact.id;

      const revision = GeneratedDocumentRevision.completed({
        id: revisionId,
        organizationId: input.organizationId,
        generatedDocumentId: input.generatedDocumentId,
        revisionNumber: input.revisionNumber,
        previousRevisionId: input.previousRevisionId,
        documentTemplateVersionId: activeVersion.id,
        dataSnapshot: input.data,
        provenance,
        missingFields,
        artifactDocumentId: artifact.id,
        artifactDocumentVersionId: artifact.currentVersion!.id,
        createdBy: input.actorId,
        occurredAt,
      });

      await this.generatedDocumentRepository.createRevision(revision);
      return revision;
    } catch (error) {
      if (createdArtifactDocumentId) {
        // L'artefact a été créé avec succès AVANT que l'échec ne survienne (ex. l'écriture de la
        // révision elle-même) — jamais laisser ce Document orphelin, non référencé par aucune
        // GeneratedDocumentRevision (correctif audit Codex P2). `purgeJustCreatedDocument` ne lève
        // jamais elle-même (échec journalisé en interne) : l'erreur d'origine reste prioritaire.
        await this.internalDocumentCleanupService.purgeJustCreatedDocument({ organizationId: input.organizationId, documentId: createdArtifactDocumentId });
      }

      const sanitizedMessage = error instanceof DocxMergeError ? error.reason : "Document generation failed.";
      const revision = GeneratedDocumentRevision.failed({
        id: revisionId,
        organizationId: input.organizationId,
        generatedDocumentId: input.generatedDocumentId,
        revisionNumber: input.revisionNumber,
        previousRevisionId: input.previousRevisionId,
        documentTemplateVersionId: activeVersion.id,
        dataSnapshot: input.data,
        provenance,
        missingFields,
        errorCode: "GENERATION_FAILED",
        errorMessage: sanitizedMessage,
        createdBy: input.actorId,
        occurredAt,
      });
      await this.generatedDocumentRepository.createRevision(revision);
      return revision;
    }
  }
}
