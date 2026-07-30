import type { KnowledgeTag } from "../../domain/knowledge-tag.entity";

export interface KnowledgeTagRepository {
  findById(input: { organizationId: string; tagId: string }): Promise<KnowledgeTag | null>;
  findByLabel(input: { organizationId: string; label: string }): Promise<KnowledgeTag | null>;
  /** Résout un tag existant par libellé normalisé, ou en crée un nouveau — jamais deux lignes pour
   *  le même libellé normalisé au sein d'une organisation (mission §4 "pas de doublons liés à la
   *  casse"), la contrainte unique `(organizationId, label)` (migration) reste le filet de
   *  sécurité ultime contre une création concurrente. */
  findOrCreate(input: { organizationId: string; label: string; displayLabel: string; occurredAt: Date }): Promise<KnowledgeTag>;
  listByOrganization(input: { organizationId: string }): Promise<readonly KnowledgeTag[]>;
  listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeTag[]>;
  attachToEntry(input: { organizationId: string; knowledgeEntryId: string; tagId: string; occurredAt: Date }): Promise<void>;
  /** Mission §4 "suppression sans casser les entrées" — ne détache que l'association, ne supprime
   *  jamais l'entrée elle-même. */
  detachFromEntry(input: { organizationId: string; knowledgeEntryId: string; tagId: string }): Promise<void>;
  /** Mission §4 "suppression sans casser les entrées" — retire aussi toutes les associations
   *  existantes (cascade contrôlée), jamais une ligne `KnowledgeEntryTag` orpheline. */
  delete(input: { organizationId: string; tagId: string }): Promise<void>;
}

export const KNOWLEDGE_TAG_REPOSITORY = Symbol("KNOWLEDGE_TAG_REPOSITORY");
