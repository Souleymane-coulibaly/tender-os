import type { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import type { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import type { KnowledgeTag } from "../../domain/knowledge-tag.entity";
import type { KnowledgeCategory } from "../../domain/knowledge-category";
import type { KnowledgeEntryStatus } from "../../domain/knowledge-entry-status";
import type { OutboxEventInput } from "../../../outbox";
import type { KnowledgeAuditLogEntry } from "./audit-log-writer";

export type ListKnowledgeEntriesFilter = Readonly<{
  organizationId: string;
  knowledgeSpaceId?: string | undefined;
  category?: KnowledgeCategory | undefined;
  status?: KnowledgeEntryStatus | undefined;
  /** Mission §"filtrer par tag" — un id de tag déjà résolu (jamais un libellé brut non normalisé,
   *  voir `KnowledgeTagRepository.findOrCreate`). */
  tagId?: string | undefined;
  /** Mission §11 "filtre pour voir les archives" — `false` par défaut : une entrée archivée est
   *  exclue des listes normales tant que ce drapeau n'est pas explicitement activé. */
  includeArchived: boolean;
  /** Mission Sprint 5.1 §"filtre client" — restreint aux entrées GLOBALES uniquement
   *  (`clientAccountId IS NULL`) quand `"GLOBAL"`, aux entrées d'un client précis quand un id est
   *  fourni ; absent = pas de filtre explicite (toutes les entrées accessibles, voir
   *  `restrictToClientAccountIdsOrGlobal`). */
  clientAccountId?: string | "GLOBAL" | undefined;
  /** Mission Sprint 5.1 §"un utilisateur standard ne voit que les clients auxquels il est affecté"
   *  — restriction AUTOMATIQUE (jamais fournie par le client) : `undefined` signifie "aucune
   *  restriction" (OWNER/ADMIN) ; un tableau (même vide) restreint aux entrées GLOBALES
   *  (`clientAccountId IS NULL`) UNION aux entrées des clients listés ici — jamais une entrée d'un
   *  client hors de cet ensemble, quel que soit le filtre `clientAccountId` explicite ci-dessus. */
  restrictToClientAccountIdsOrGlobal?: readonly string[] | undefined;
  createdAfter?: Date | undefined;
  createdBefore?: Date | undefined;
  /** Mission §8/§9 "recherche par titre" — un filtre texte simple sur le titre uniquement (la
   *  recherche plein contenu passe par `KnowledgeSearchProvider`, jamais ce repository). */
  titleSearch?: string | undefined;
  cursor?: string | undefined;
  limit: number;
  sort?: "createdAt" | "updatedAt" | "title" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListKnowledgeEntriesResult = Readonly<{ items: readonly KnowledgeEntry[]; nextCursor: string | null; total: number }>;

export interface KnowledgeEntryRepository {
  findById(input: { organizationId: string; knowledgeEntryId: string }): Promise<KnowledgeEntry | null>;
  create(entry: KnowledgeEntry): Promise<void>;
  save(entry: KnowledgeEntry): Promise<void>;
  /**
   * Création atomique COURTE (correction audit Codex "Anomalie 2") : l'entrée, sa version 1, ses
   * tags (résolution + association) ET son entrée d'audit réussissent ou échouent TOUS ensemble
   * (correction "Corrections Sprint 5" §"atomicité audit/mutation") — jamais une entrée ou une
   * version résiduelle si la résolution/association d'un tag échoue en cours de route, jamais un
   * tag créé inutilement si la transaction est finalement annulée, et jamais une entrée créée sans
   * sa trace d'audit correspondante (ni l'inverse).
   */
  createWithVersionAndTags(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    tagLabels: readonly { label: string; displayLabel: string }[];
    occurredAt: Date;
    auditEntry: KnowledgeAuditLogEntry;
    /** V2 Sprint 8 §Décision 5 — écrit DANS LA MÊME transaction que l'entrée/version/tags/audit,
     *  même motif d'atomicité (jamais une entrée créée sans son événement `KnowledgeEntryCreated`
     *  correspondant, ni l'inverse). */
    outboxEvents: readonly OutboxEventInput[];
  }): Promise<{ tags: readonly KnowledgeTag[] }>;
  /**
   * Suppression définitive, cascade maîtrisée (mission §11) — voir `DeleteKnowledgeEntryUseCase`
   * pour la règle métier qui la précède (archivage préalable obligatoire). L'entrée d'audit est
   * écrite DANS LA MÊME transaction que la suppression (correction "Corrections Sprint 5" —
   * jamais une suppression sans trace d'audit correspondante).
   */
  delete(input: { organizationId: string; knowledgeEntryId: string; auditEntry: KnowledgeAuditLogEntry; outboxEvents: readonly OutboxEventInput[] }): Promise<void>;
  /**
   * Correctif audit Codex P1-02 — mutation de l'entrée SEULE (archive/restore) DANS LA MÊME
   * transaction que son entrée d'audit et ses événements Outbox : jamais un statut persisté sans
   * sa trace d'audit/Outbox correspondante (même motif que `createWithVersionAndTags`/`delete`).
   */
  saveWithAudit(input: { entry: KnowledgeEntry; auditEntry: KnowledgeAuditLogEntry; outboxEvents: readonly OutboxEventInput[] }): Promise<void>;
  /**
   * Correctif audit Codex P1-02 — mutation de métadonnées (`UpdateKnowledgeEntryUseCase`) : l'entrée
   * (nouveau `activeVersionNumber`) ET la nouvelle version qu'il représente sont écrites ENSEMBLE,
   * jamais l'une sans l'autre (jamais un `activeVersionNumber` incrémenté sans la ligne de version
   * correspondante), avec l'audit/Outbox dans la même transaction.
   */
  updateWithNewVersion(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    auditEntry: KnowledgeAuditLogEntry;
    outboxEvents: readonly OutboxEventInput[];
  }): Promise<void>;
  /**
   * Correctif audit Codex P1-02 — validation (`ValidateKnowledgeEntryUseCase`) : le stamp de
   * validation dénormalisé sur l'entrée ET celui, historique, sur SA version active sont écrits
   * ENSEMBLE, jamais l'un sans l'autre (jamais une entrée "validée" dont la version active ne l'est
   * pas, ni l'inverse), avec l'audit/Outbox dans la même transaction.
   */
  saveValidationWithVersion(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    auditEntry: KnowledgeAuditLogEntry;
    outboxEvents: readonly OutboxEventInput[];
  }): Promise<void>;
  list(filter: ListKnowledgeEntriesFilter): Promise<ListKnowledgeEntriesResult>;
  /** Mission §"nombre d'entrées" (écran principal) — comptage global tenant-aware, jamais un
   *  chargement complet de la liste juste pour compter (mission §"Performance"). */
  countByOrganization(input: { organizationId: string; includeArchived: boolean }): Promise<number>;
}

export const KNOWLEDGE_ENTRY_REPOSITORY = Symbol("KNOWLEDGE_ENTRY_REPOSITORY");
