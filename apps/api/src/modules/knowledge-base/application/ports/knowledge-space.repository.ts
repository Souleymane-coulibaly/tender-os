import type { KnowledgeSpace } from "../../domain/knowledge-space.aggregate";

export interface KnowledgeSpaceRepository {
  findById(input: { organizationId: string; knowledgeSpaceId: string }): Promise<KnowledgeSpace | null>;
  findByOrganizationAndName(input: { organizationId: string; name: string }): Promise<KnowledgeSpace | null>;
  /** Idempotent au niveau applicatif (mission §1 "créé de manière idempotente") — la contrainte
   *  unique `(organizationId, name)` (voir migration) est le filet de sécurité ultime contre une
   *  double création concurrente ; l'appelant (`GetOrCreateDefaultKnowledgeSpaceUseCase`) retente
   *  un `findByOrganizationAndName` si cette création échoue sur cette contrainte. */
  create(space: KnowledgeSpace): Promise<void>;
}

export const KNOWLEDGE_SPACE_REPOSITORY = Symbol("KNOWLEDGE_SPACE_REPOSITORY");
