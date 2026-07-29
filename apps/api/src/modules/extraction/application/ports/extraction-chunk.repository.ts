import type { ExtractionChunk } from "../../domain/extraction-chunk.entity";

export interface ExtractionChunkRepository {
  /** Remplace ATOMIQUEMENT tous les chunks d'un document (mission §15 "un retry ne doit pas
   *  dupliquer les chunks") — jamais un ajout incrémental : une resegmentation invalide
   *  entièrement le jeu précédent. */
  replaceChunks(input: { organizationId: string; documentId: string; chunks: readonly ExtractionChunk[] }): Promise<void>;
  listByDocumentId(input: { organizationId: string; documentId: string }): Promise<ExtractionChunk[]>;
  countByDocumentId(input: { organizationId: string; documentId: string }): Promise<number>;
}

export const EXTRACTION_CHUNK_REPOSITORY = Symbol("EXTRACTION_CHUNK_REPOSITORY");
