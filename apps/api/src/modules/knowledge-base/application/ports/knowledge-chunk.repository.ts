import type { KnowledgeChunk } from "../../domain/knowledge-chunk.entity";

/** Port en LECTURE SEULE (mission §7/§12 "consulter le contenu extrait"/"provenance") — l'écriture
 *  des chunks est toujours atomique avec la finalisation du traitement, voir
 *  `KnowledgeDocumentRepository.finalizeAttempt`, jamais un chemin d'écriture séparé ici. */
export interface KnowledgeChunkRepository {
  listByDocumentId(input: { organizationId: string; knowledgeDocumentId: string }): Promise<readonly KnowledgeChunk[]>;
  findBySequence(input: { organizationId: string; knowledgeDocumentId: string; sequence: number }): Promise<KnowledgeChunk | null>;
}

export const KNOWLEDGE_CHUNK_REPOSITORY = Symbol("KNOWLEDGE_CHUNK_REPOSITORY");
