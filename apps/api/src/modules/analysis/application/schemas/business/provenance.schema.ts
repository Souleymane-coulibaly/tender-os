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
/** Chaque champ optionnel est aussi `.nullable()` (mission — correctif crash prod
 *  `AI_SCHEMA_VALIDATION_FAILED`, "Expected string, received null") : le schéma JSON Structured
 *  Outputs strict d'OpenAI (`strict-output-schemas.ts`) envoie explicitement `null` pour tout champ
 *  non renseigné — le mode strict n'a pas de notion d'absence de clé, seulement de valeur nulle.
 *  `.optional()` seul (qui n'accepte que l'ABSENCE de la clé) rejetait donc à tort une réponse par
 *  ailleurs valide ; `.nullable()` accepte en plus `null`, jamais un assouplissement du type accepté
 *  par ailleurs. */
export const ProvenanceSchema = z.object({
  chunkSequence: z.number().int().min(0).optional().nullable(),
  pageStart: z.number().int().min(1).optional().nullable(),
  pageEnd: z.number().int().min(1).optional().nullable(),
  sheetName: z.string().min(1).max(120).optional().nullable(),
  sectionTitle: z.string().min(1).max(300).optional().nullable(),
  citation: z.string().min(1).max(500).optional().nullable(),
  /// Mission §"Si une information est déduite, indiquer explicitement qu'il s'agit d'une
  /// inférence" — jamais une déduction présentée comme une citation directe.
  isInferred: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export type ProvenanceOutput = z.infer<typeof ProvenanceSchema>;

/** Provenance au niveau tender (consolidation) — désigne en plus le document source parmi ceux
 *  fournis en entrée (mission §"Consolidation Tender... provenance multiple"). */
export const TenderProvenanceSchema = ProvenanceSchema.extend({
  documentId: z.string().uuid().optional().nullable(),
});

export type TenderProvenanceOutput = z.infer<typeof TenderProvenanceSchema>;
