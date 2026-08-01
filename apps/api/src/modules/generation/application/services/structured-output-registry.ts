import { z } from "zod";

/**
 * Sortie structurée pour CRITERION_RESPONSE (mission Sprint 6 §"Génération structurée") —
 * `sources` est vérifié après coup par `generation-citation-validator.ts` (jamais une confiance
 * auto-déclarée par le modèle). Un tableau vide de `sources` est valide (réponse sans citation
 * Knowledge Base) — mais toute source PRÉSENTE doit être vérifiable.
 */
export const CriterionResponseOutputSchema = z
  .object({
    title: z.string().min(1),
    content: z.string().min(1),
    keyPoints: z.array(z.string().min(1)).default([]),
    sources: z
      .array(
        z.object({
          knowledgeEntryId: z.string().min(1),
          citation: z.string().optional(),
        }),
      )
      .default([]),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

export type CriterionResponseOutput = z.infer<typeof CriterionResponseOutputSchema>;

/** Registre `structuredSchemaKey -> schéma` (mission §"Ne code pas en dur toute la logique dans un
 *  seul service") — ajouter un nouveau type de tâche structuré est une ligne ici, jamais une
 *  réécriture d'un use case. Une seule entrée en MVP (voir rapport final §D pour la justification
 *  du périmètre). */
export const STRUCTURED_OUTPUT_REGISTRY: Readonly<Record<string, z.ZodType>> = {
  CRITERION_RESPONSE: CriterionResponseOutputSchema,
};

export function getStructuredOutputSchema(schemaKey: string): z.ZodType | undefined {
  return STRUCTURED_OUTPUT_REGISTRY[schemaKey];
}
