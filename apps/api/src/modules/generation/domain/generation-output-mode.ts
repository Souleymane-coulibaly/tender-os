import { InvalidGenerationOutputModeError } from "./errors";

/** FREE_TEXT = contenu généré tel quel ; STRUCTURED = validé contre un schéma Zod du registre
 *  applicatif (`structured-output-registry.ts`) avant d'être considéré comme une génération réussie. */
export const GenerationOutputMode = {
  FreeText: "FREE_TEXT",
  Structured: "STRUCTURED",
} as const;

export type GenerationOutputMode = (typeof GenerationOutputMode)[keyof typeof GenerationOutputMode];

export function isGenerationOutputMode(value: string): value is GenerationOutputMode {
  return Object.values(GenerationOutputMode).includes(value as GenerationOutputMode);
}

export function parseGenerationOutputMode(value: string): GenerationOutputMode {
  if (!isGenerationOutputMode(value)) {
    throw new InvalidGenerationOutputModeError(value);
  }
  return value;
}
