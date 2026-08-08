import type { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";

export interface KnowledgeEntryVersionRepository {
  create(version: KnowledgeEntryVersion): Promise<void>;
  /** Mission §10 "historique consultable" — la plus récente d'abord, jamais un ordre dépendant de
   *  l'implémentation. */
  listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeEntryVersion[]>;
  findByVersionNumber(input: { organizationId: string; knowledgeEntryId: string; versionNumber: number }): Promise<KnowledgeEntryVersion | null>;
  /** V2 Sprint 8 — persiste le stamp de validation d'UNE version déjà existante (mise à jour
   *  ciblée des deux colonnes, jamais une nouvelle ligne — voir `KnowledgeEntryVersion.withValidation`). */
  saveValidation(version: KnowledgeEntryVersion): Promise<void>;
}

export const KNOWLEDGE_ENTRY_VERSION_REPOSITORY = Symbol("KNOWLEDGE_ENTRY_VERSION_REPOSITORY");
