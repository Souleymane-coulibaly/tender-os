import { z } from "zod";

/**
 * Provenance commune à toute donnée métier extraite (mission Sprint 4.2 §"Provenance
 * obligatoire") — au niveau document (un seul document déjà connu du contexte), `documentId` est
 * absent du schéma LLM et rattaché par l'application au moment de la persistance. Au niveau
 * tender (consolidation multi-documents), le modèle DOIT désigner le document source : voir
 * `TenderProvenanceSchema` ci-dessous, qui étend celui-ci avec `documentId`.
 *
 * `confidence` est le score déclaré par le modèle (mission §"Score de confiance") — jamais utilisé
 * seul : voir les validations déterministes appliquées après coup (citation retrouvée dans le
 * chunk cité, document réellement présent parmi les documents consolidés, etc.).
 */
export const ProvenanceSchema = z.object({
  chunkSequence: z.number().int().min(0).optional(),
  pageStart: z.number().int().min(1).optional(),
  pageEnd: z.number().int().min(1).optional(),
  sheetName: z.string().min(1).max(120).optional(),
  sectionTitle: z.string().min(1).max(300).optional(),
  citation: z.string().min(1).max(500).optional(),
  /// Mission §"Si une information est déduite, indiquer explicitement qu'il s'agit d'une
  /// inférence" — jamais une déduction présentée comme une citation directe.
  isInferred: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export type ProvenanceOutput = z.infer<typeof ProvenanceSchema>;

/** Provenance au niveau tender (consolidation) — désigne en plus le document source parmi ceux
 *  fournis en entrée (mission §"Consolidation Tender... provenance multiple"). */
export const TenderProvenanceSchema = ProvenanceSchema.extend({
  documentId: z.string().uuid().optional(),
});

export type TenderProvenanceOutput = z.infer<typeof TenderProvenanceSchema>;
