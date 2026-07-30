import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import {
  CreateDocumentWithFirstVersionUseCase,
  DocumentDomain,
  DocumentOrigin,
  InternalDocumentCleanupService,
  type IncomingFile,
} from "../../../documents";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { KnowledgeEntryArchivedError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeDocument } from "../../domain/knowledge-document.entity";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgeEntryStatus } from "../../domain/knowledge-entry-status";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_DISPATCHER, type KnowledgeDispatcher } from "../ports/knowledge-dispatcher";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { validateKnowledgeMetadata } from "../schemas/metadata/metadata-validator";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./get-or-create-default-knowledge-space.use-case";

export type AddKnowledgeDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  /** Si fourni : le document est ajouté à cette entrée EXISTANTE (mission §"association à une
   *  entrée existante") — sinon une NOUVELLE entrée est créée à partir du document (mission
   *  §"...ou création d'une nouvelle entrée selon le contrat choisi"), les champs ci-dessous
   *  deviennent alors obligatoires. */
  knowledgeEntryId?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  language?: string | undefined;
  metadata?: unknown;
  tags?: readonly string[] | undefined;
  /** Mission Sprint 5.1 §"sélection du client à la création" — uniquement pertinent quand une
   *  NOUVELLE entrée est créée (`knowledgeEntryId` absent) ; ignoré si `knowledgeEntryId` est fourni
   *  (le client de l'entrée existante est immuable, voir `KnowledgeEntry.clientAccountId`). */
  clientAccountId?: string | undefined;
  file: IncomingFile;
  maxFileSizeBytes: number;
  requestId?: string | undefined;
}>;

/**
 * Importe un document et l'associe à une entrée de connaissance (mission Sprint 5 §6) — délègue
 * INTÉGRALEMENT le stockage physique/validation de fichier à `CreateDocumentWithFirstVersionUseCase`
 * (module Documents, `domain: KNOWLEDGE`) : mission §"Ne pas dupliquer... stockage fichier". Ne
 * lance jamais le traitement de façon synchrone — crée le `KnowledgeDocument` en PENDING et le
 * confie au dispatcher (même motif que Extraction/Analysis).
 *
 * Correction audit Codex "Anomalie 2" — séquence corrigée : (1) validation/résolution en mémoire
 * SEULEMENT, aucune écriture ; (2) stockage physique + création du `Document` (module Documents,
 * déjà atomique et auto-compensée en interne) ; (3) UNE SEULE transaction Prisma courte pour
 * TOUTES les écritures côté Knowledge (entrée, version, `KnowledgeDocument`, tags, ET l'entrée
 * d'audit — correction "Corrections Sprint 5" §"atomicité audit/mutation", jamais un document
 * ajouté sans trace d'audit correspondante) — voir `KnowledgeDocumentRepository.createForEntry`.
 * Si cette transaction échoue APRÈS que le stockage a réussi, le `Document` physique fraîchement
 * créé est explicitement purgé (fichier + lignes DB) via `InternalDocumentCleanupService` (même
 * mécanisme que `ImportDceFilesUseCase`, module DCE) — jamais de `Document` orphelin, jamais de
 * transaction Prisma ouverte pendant le stockage/l'appel externe.
 */
@Injectable()
export class AddKnowledgeDocumentUseCase {
  private readonly logger = new Logger(AddKnowledgeDocumentUseCase.name);

  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DISPATCHER) private readonly knowledgeDispatcher: KnowledgeDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly internalDocumentCleanupService: InternalDocumentCleanupService,
    private readonly getOrCreateDefaultKnowledgeSpaceUseCase: GetOrCreateDefaultKnowledgeSpaceUseCase,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: AddKnowledgeDocumentCommand): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.ImportDocument);

    const occurredAt = this.clock.now();

    // Étape 1 — résolution/validation EN MÉMOIRE uniquement, aucune écriture (mission "jamais une
    // entrée orpheline si le stockage échoue ensuite" : contrairement à la version précédente, une
    // entrée neuve n'est plus persistée avant que le stockage n'ait réussi).
    let entry: KnowledgeEntry;
    let isNewEntry: boolean;

    if (command.knowledgeEntryId) {
      const existing = await this.knowledgeEntryRepository.findById({ organizationId: command.organizationId, knowledgeEntryId: command.knowledgeEntryId });
      if (!existing) {
        throw new KnowledgeEntryNotFoundError();
      }
      if (existing.status === KnowledgeEntryStatus.Archived) {
        throw new KnowledgeEntryArchivedError();
      }
      // Mission Sprint 5.1 §"Knowledge Base" — le client d'une entrée existante est immuable
      // (jamais fourni par `command.clientAccountId` ici) : seul l'accès à CE client, déjà porté
      // par l'entrée, est vérifié avant d'y ajouter un document.
      if (existing.clientAccountId) {
        await this.assertClientAccessUseCase.execute({
          organizationId: command.organizationId,
          clientAccountId: existing.clientAccountId,
          actorId: command.actorId,
          actorRole: command.actorRole,
          permission: ClientPermission.ManageKnowledge,
        });
      }
      entry = existing;
      isNewEntry = false;
    } else {
      if (!command.title || !command.category) {
        throw new Error("title and category are required to create a new knowledge entry from a document.");
      }
      if (command.clientAccountId) {
        const client = await this.getClientAccountUseCase.execute({
          organizationId: command.organizationId,
          clientAccountId: command.clientAccountId,
          actorId: command.actorId,
          actorRole: command.actorRole,
        });
        if (client.status === "ARCHIVED") {
          throw new ClientAccountArchivedError();
        }
        await this.assertClientAccessUseCase.execute({
          organizationId: command.organizationId,
          clientAccountId: command.clientAccountId,
          actorId: command.actorId,
          actorRole: command.actorRole,
          permission: ClientPermission.ManageKnowledge,
        });
      }

      const category = parseKnowledgeCategory(command.category);
      const metadata = validateKnowledgeMetadata(category, command.metadata);
      const space = await this.getOrCreateDefaultKnowledgeSpaceUseCase.getOrCreate(command.organizationId);

      entry = KnowledgeEntry.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        knowledgeSpaceId: space.id,
        clientAccountId: command.clientAccountId,
        title: command.title,
        description: command.description,
        category,
        sourceType: KnowledgeSourceType.DocumentImport,
        language: command.language,
        metadata,
        createdByUserId: command.actorId,
        occurredAt,
      });
      isNewEntry = true;
    }

    // Étape 2 — stockage physique + création du Document (module Documents) : déjà atomique et
    // auto-compensée en interne (upload avant la transaction, suppression du fichier si la
    // transaction DB de CE module échoue). Jamais dans une transaction Prisma Knowledge Base.
    const storedDocument = await this.createDocumentWithFirstVersionUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      title: command.title ?? entry.title,
      origin: DocumentOrigin.UserUpload,
      domain: DocumentDomain.Knowledge,
      category: entry.category,
      file: command.file,
      maxFileSizeBytes: command.maxFileSizeBytes,
      requestId: command.requestId,
    });

    // Étape 3 — construction EN MÉMOIRE des écritures Knowledge restantes.
    const versionNumberForThisDocument = isNewEntry ? entry.activeVersionNumber : entry.activeVersionNumber + 1;
    const knowledgeDocument = KnowledgeDocument.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      knowledgeEntryId: entry.id,
      documentId: storedDocument.id,
      versionNumber: versionNumberForThisDocument,
      occurredAt,
    });

    let entryVersion: KnowledgeEntryVersion;
    if (isNewEntry) {
      entry.beginInitialProcessing(occurredAt);
      entryVersion = KnowledgeEntryVersion.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        knowledgeEntryId: entry.id,
        versionNumber: 1,
        reason: "Création depuis un document importé",
        snapshot: { title: entry.title, description: entry.description, category: entry.category, language: entry.language, metadata: entry.metadata },
        createdByUserId: command.actorId,
        occurredAt,
      });
    } else {
      entry.startDocumentProcessing(occurredAt);
      entryVersion = KnowledgeEntryVersion.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        knowledgeEntryId: entry.id,
        versionNumber: entry.activeVersionNumber,
        reason: "Nouveau document importé",
        snapshot: {
          title: entry.title,
          description: entry.description,
          category: entry.category,
          language: entry.language,
          metadata: entry.metadata,
          knowledgeDocumentId: knowledgeDocument.id,
        },
        createdByUserId: command.actorId,
        occurredAt,
      });
    }

    // Étape 4 — UNE SEULE transaction courte pour toutes les écritures Knowledge restantes. En cas
    // d'échec ICI, le Document créé à l'étape 2 est désormais orphelin : compensation explicite.
    let tags;
    try {
      ({ tags } = await this.knowledgeDocumentRepository.createForEntry({
        isNewEntry,
        entry,
        entryVersion,
        document: knowledgeDocument,
        tagLabels: (command.tags ?? []).map((rawLabel) => ({ label: rawLabel, displayLabel: rawLabel.trim() })),
        occurredAt,
        auditEntry: {
          organizationId: command.organizationId,
          actorType: "USER",
          actorId: command.actorId,
          action: "knowledge_document.added",
          resourceType: "knowledge_entry",
          resourceId: entry.id,
          requestId: command.requestId,
          metadata: { knowledgeDocumentId: knowledgeDocument.id, documentId: storedDocument.id },
        },
      }));
    } catch (error) {
      // Même motif que ImportDceFilesUseCase (module DCE) — jamais DeleteDocumentUseCase (protégé
      // par DocumentPermission.Delete : un CONTRIBUTOR a knowledge:import_document mais pas
      // forcément document:delete). InternalDocumentCleanupService ne lève jamais lui-même ; le
      // `catch` ci-dessous est un filet de sécurité pour que l'erreur d'origine reste prioritaire.
      await this.internalDocumentCleanupService.purgeJustCreatedDocument({ organizationId: command.organizationId, documentId: storedDocument.id }).catch((cleanupError: unknown) => {
        this.logger.error(
          `Compensation failed: could not purge orphaned Document ${storedDocument.id} after a KnowledgeDocument linking failure ` +
            `(knowledgeEntryId=${entry.id}). Manual cleanup required.`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      });
      throw error;
    }

    this.knowledgeDispatcher.dispatch({ organizationId: command.organizationId, knowledgeDocumentId: knowledgeDocument.id, requestId: command.requestId });

    // Pour une entrée déjà existante, `tags` ne contient que les tags AJOUTÉS par cet appel —
    // jamais l'ensemble complet déjà associé à l'entrée (mission §"consulter les tags de
    // l'entrée") ; une nouvelle entrée n'a, elle, jamais eu d'autres tags avant cet appel.
    const allTags = isNewEntry ? tags : await this.knowledgeTagRepository.listByEntryId({ organizationId: command.organizationId, knowledgeEntryId: entry.id });
    const documents = await this.knowledgeDocumentRepository.listByEntryId({ organizationId: command.organizationId, knowledgeEntryId: entry.id });
    return toKnowledgeEntrySummary(entry, allTags, documents.length);
  }
}
