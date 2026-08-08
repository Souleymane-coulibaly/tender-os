import type { KnowledgeCategory } from "./knowledge-category";
import { ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS, KnowledgeEntryStatus } from "./knowledge-entry-status";
import { KnowledgeSourceType } from "./knowledge-source-type";
import {
  InvalidKnowledgeEntryStatusTransitionError,
  KnowledgeEntryAlreadyValidatedError,
  KnowledgeEntryArchivedError,
  KnowledgeEntryNotArchivedError,
  KnowledgeEntryNotReadyForValidationError,
} from "./errors";

export type KnowledgeEntryProps = {
  id: string;
  organizationId: string;
  knowledgeSpaceId: string;
  /** Mission Sprint 5.1 §"Knowledge Base" — `undefined` = connaissance GLOBALE de l'organisation
   *  (présentation, méthodologies génériques, certifications, RGPD...), toujours visible selon le
   *  rôle d'organisation ; une valeur = connaissance SPÉCIFIQUE à ce client (historique, références
   *  faites pour lui, contrats, contraintes particulières...), visible uniquement à ceux qui ont
   *  accès à ce client. JAMAIS modifiable après création (mission §"jamais une bascule global/
   *  client après création") — aucune méthode de mutation n'existe pour ce champ. */
  clientAccountId?: string | undefined;
  title: string;
  description?: string | undefined;
  category: KnowledgeCategory;
  sourceType: KnowledgeSourceType;
  status: KnowledgeEntryStatus;
  language?: string | undefined;
  /** JSON déjà validé par `application/schemas/metadata` selon `category` avant d'atteindre le
   *  domaine (mission §5 "Toute donnée JSON doit être validée") — le domaine ne revalide jamais
   *  la forme, seulement l'identité/le cycle de vie de l'entrée. */
  metadata: Record<string, unknown>;
  /** Version active de CETTE entrée (mission §10 "Versionnement") — incrémentée uniquement par
   *  les mutations substantielles (métadonnées, document remplacé/réimporté) ; jamais par un ajout/
   *  retrait de tag (mission §"éviter que chaque changement mineur de tag produise une version
   *  lourde") : les tags sont gérés hors de cet agrégat, sans jamais appeler les méthodes
   *  ci-dessous. */
  activeVersionNumber: number;
  /** V2 Sprint 8 §15/§16 — dénormalisation "la version ACTIVE est-elle validée" (voir le
   *  commentaire du champ Prisma pour la justification complète). `undefined` par défaut, y
   *  compris pour une entrée `AI_GENERATED`/importée — jamais une confiance héritée. */
  validatedByUserId?: string | undefined;
  validatedAt?: Date | undefined;
  /** V2 Sprint 8 §18 — provenance, renseignée UNIQUEMENT à la création par
   *  `PromoteChecklistItemToKnowledgeUseCase` (jamais imposable par le client, jamais modifiable
   *  ensuite — même motif d'immutabilité que `clientAccountId` ci-dessus). */
  sourceTenderId?: string | undefined;
  sourceChecklistItemId?: string | undefined;
  sourceDocumentId?: string | undefined;
  sourceDocumentVersionId?: string | undefined;
  promotedByUserId?: string | undefined;
  promotedAt?: Date | undefined;
  createdByUserId: string;
  updatedByUserId?: string | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeEntryMetadataUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  category?: KnowledgeCategory | undefined;
  language?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

/**
 * Entrée de connaissance (mission Sprint 5 §2) — peut exister sans jamais avoir de document
 * (MANUAL, immédiatement READY) ou être adossée à un document importé (DOCUMENT_IMPORT, démarre
 * DRAFT puis transite via le traitement du document, voir `KnowledgeDocument`). Ne connaît jamais
 * Prisma, NestJS, ni le contenu du document — uniquement son propre cycle de vie et ses métadonnées
 * déjà validées.
 */
export class KnowledgeEntry {
  private constructor(private props: KnowledgeEntryProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    knowledgeSpaceId: string;
    clientAccountId?: string | undefined;
    title: string;
    description?: string | undefined;
    category: KnowledgeCategory;
    sourceType: KnowledgeSourceType;
    language?: string | undefined;
    metadata: Record<string, unknown>;
    sourceTenderId?: string | undefined;
    sourceChecklistItemId?: string | undefined;
    sourceDocumentId?: string | undefined;
    sourceDocumentVersionId?: string | undefined;
    promotedByUserId?: string | undefined;
    promotedAt?: Date | undefined;
    createdByUserId: string;
    occurredAt: Date;
  }): KnowledgeEntry {
    return new KnowledgeEntry({
      id: input.id,
      organizationId: input.organizationId,
      knowledgeSpaceId: input.knowledgeSpaceId,
      clientAccountId: input.clientAccountId,
      title: input.title,
      description: input.description,
      category: input.category,
      sourceType: input.sourceType,
      // Mission §2 — une entrée manuelle n'a rien à traiter, elle est immédiatement consultable ;
      // une entrée issue d'un import démarre DRAFT jusqu'à ce qu'un document lui soit associé.
      status: input.sourceType === KnowledgeSourceType.DocumentImport ? KnowledgeEntryStatus.Draft : KnowledgeEntryStatus.Ready,
      language: input.language,
      metadata: input.metadata,
      activeVersionNumber: 1,
      validatedByUserId: undefined,
      validatedAt: undefined,
      sourceTenderId: input.sourceTenderId,
      sourceChecklistItemId: input.sourceChecklistItemId,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      promotedByUserId: input.promotedByUserId,
      promotedAt: input.promotedAt,
      createdByUserId: input.createdByUserId,
      updatedByUserId: undefined,
      archivedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: KnowledgeEntryProps): KnowledgeEntry {
    return new KnowledgeEntry(props);
  }

  private transitionTo(next: KnowledgeEntryStatus, occurredAt: Date): void {
    const allowed = ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidKnowledgeEntryStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  private assertNotArchived(): void {
    if (this.props.status === KnowledgeEntryStatus.Archived) {
      throw new KnowledgeEntryArchivedError();
    }
  }

  /** Mutation substantielle (mission §10) — incrémente toujours `activeVersionNumber` : appelée
   *  UNIQUEMENT quand au moins un champ change réellement (voir le use case appelant, qui décide
   *  s'il y a lieu de l'invoquer — un simple ajout de tag ne l'appelle jamais). */
  updateMetadata(update: KnowledgeEntryMetadataUpdate, updatedByUserId: string, occurredAt: Date): void {
    this.assertNotArchived();

    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.category !== undefined) this.props.category = update.category;
    if (update.language !== undefined) this.props.language = update.language;
    if (update.metadata !== undefined) this.props.metadata = update.metadata;

    this.props.activeVersionNumber += 1;
    // Mission §16/§71 — une nouvelle version active n'hérite JAMAIS de la confiance de la
    // précédente : la validation historique de l'ancienne version reste vraie sur SA propre ligne
    // `KnowledgeEntryVersion`, mais cette dénormalisation (validation de la version ACTIVE)
    // redémarre à zéro tant qu'un humain ne la revalide pas explicitement.
    this.props.validatedByUserId = undefined;
    this.props.validatedAt = undefined;
    this.props.updatedByUserId = updatedByUserId;
    this.props.updatedAt = occurredAt;
  }

  /** Traitement du document initial d'une entrée fraîchement créée (mission §2 "créée à partir
   *  d'un document importé") — la version 1 REPRÉSENTE déjà ce document, jamais de bump ici
   *  (contrairement à `startDocumentProcessing`, pour un document ajouté PLUS TARD à une entrée
   *  déjà existante). */
  beginInitialProcessing(occurredAt: Date): void {
    this.transitionTo(KnowledgeEntryStatus.Processing, occurredAt);
  }

  /** Mission §"nouvelle extraction"/"remplacement d'un document" — bascule vers PROCESSING et
   *  incrémente la version, indépendamment de toute modification de métadonnées : un nouveau
   *  document ajouté à une entrée déjà existante constitue toujours une mutation substantielle. */
  startDocumentProcessing(occurredAt: Date): void {
    this.assertNotArchived();
    this.transitionTo(KnowledgeEntryStatus.Processing, occurredAt);
    this.props.activeVersionNumber += 1;
    // Même motif que `updateMetadata` — un nouveau document constitue une nouvelle version active,
    // jamais validée par défaut (mission §16/§71).
    this.props.validatedByUserId = undefined;
    this.props.validatedAt = undefined;
  }

  completeDocumentProcessing(
    input: { outcome: typeof KnowledgeEntryStatus.Ready | typeof KnowledgeEntryStatus.PartiallyReady | typeof KnowledgeEntryStatus.Failed; language?: string | undefined },
    occurredAt: Date,
  ): void {
    this.transitionTo(input.outcome, occurredAt);
    if (input.language !== undefined) this.props.language = input.language;
  }

  /** V2 Sprint 8 §15/§16 — décision humaine explicite, jamais implicite : seule la version ACTIVE
   *  d'une entrée READY/PARTIALLY_READY peut être marquée validée (une entrée DRAFT/PROCESSING/
   *  FAILED n'a rien de stable à valider, une entrée ARCHIVED doit d'abord être restaurée). Refuse
   *  une revalidation silencieuse de la même version déjà validée (mission §16, généralisé). */
  validate(validatedByUserId: string, occurredAt: Date): void {
    if (this.props.status !== KnowledgeEntryStatus.Ready && this.props.status !== KnowledgeEntryStatus.PartiallyReady) {
      throw new KnowledgeEntryNotReadyForValidationError({ status: this.props.status });
    }
    if (this.props.validatedAt !== undefined) {
      throw new KnowledgeEntryAlreadyValidatedError();
    }
    this.props.validatedByUserId = validatedByUserId;
    this.props.validatedAt = occurredAt;
  }

  archive(occurredAt: Date): void {
    this.transitionTo(KnowledgeEntryStatus.Archived, occurredAt);
    this.props.archivedAt = occurredAt;
  }

  /** Mission §11 — ramène toujours au statut READY (voir `knowledge-entry-status.ts` pour la
   *  justification de ce choix simple plutôt qu'un statut "pré-archive" reconstruit). */
  restore(occurredAt: Date): void {
    if (this.props.status !== KnowledgeEntryStatus.Archived) {
      throw new KnowledgeEntryNotArchivedError();
    }
    this.transitionTo(KnowledgeEntryStatus.Ready, occurredAt);
    this.props.archivedAt = undefined;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get knowledgeSpaceId(): string {
    return this.props.knowledgeSpaceId;
  }
  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get category(): KnowledgeCategory {
    return this.props.category;
  }
  get sourceType(): KnowledgeSourceType {
    return this.props.sourceType;
  }
  get status(): KnowledgeEntryStatus {
    return this.props.status;
  }
  get language(): string | undefined {
    return this.props.language;
  }
  get metadata(): Record<string, unknown> {
    return this.props.metadata;
  }
  get activeVersionNumber(): number {
    return this.props.activeVersionNumber;
  }
  get validatedByUserId(): string | undefined {
    return this.props.validatedByUserId;
  }
  get validatedAt(): Date | undefined {
    return this.props.validatedAt;
  }
  get sourceTenderId(): string | undefined {
    return this.props.sourceTenderId;
  }
  get sourceChecklistItemId(): string | undefined {
    return this.props.sourceChecklistItemId;
  }
  get sourceDocumentId(): string | undefined {
    return this.props.sourceDocumentId;
  }
  get sourceDocumentVersionId(): string | undefined {
    return this.props.sourceDocumentVersionId;
  }
  get promotedByUserId(): string | undefined {
    return this.props.promotedByUserId;
  }
  get promotedAt(): Date | undefined {
    return this.props.promotedAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get updatedByUserId(): string | undefined {
    return this.props.updatedByUserId;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
