import { z } from "zod";
import { AiSchemaValidationFailedError } from "../../domain/errors";

/**
 * Schéma de sortie technique du provider pour le Sprint 4.1 (mission §"Sortie du provider pour le
 * Sprint 4.1"/"Validation de sortie") — volontairement minimal, jamais une structure métier
 * détaillée. Ne fait jamais confiance au JSON brut du provider : toute réponse qui ne satisfait
 * pas ce schéma échoue avec `AI_SCHEMA_VALIDATION_FAILED`, jamais silencieusement acceptée.
 */
export const AnalysisOutputSchema = z.object({
  output: z.object({
    summary: z.string().min(1).max(4000),
  }),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export function parseAnalysisOutput(rawContent: string): AnalysisOutput {
  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch {
    throw new AiSchemaValidationFailedError({ reason: "response is not valid JSON" });
  }

  const result = AnalysisOutputSchema.safeParse(json);
  if (!result.success) {
    throw new AiSchemaValidationFailedError({ reason: result.error.issues.map((issue) => issue.message).join("; ") });
  }
  return result.data;
}
