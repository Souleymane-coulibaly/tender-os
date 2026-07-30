import type { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";

export interface KnowledgeEntryVersionRepository {
  create(version: KnowledgeEntryVersion): Promise<void>;
  /** Mission §10 "historique consultable" — la plus récente d'abord, jamais un ordre dépendant de
   *  l'implémentation. */
  listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeEntryVersion[]>;
  findByVersionNumber(input: { organizationId: string; knowledgeEntryId: string; versionNumber: number }): Promise<KnowledgeEntryVersion | null>;
}

export const KNOWLEDGE_ENTRY_VERSION_REPOSITORY = Symbol("KNOWLEDGE_ENTRY_VERSION_REPOSITORY");
