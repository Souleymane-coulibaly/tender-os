import { z } from "zod";

/**
 * Sortie structurée attendue du modèle pour CHAQUE réponse Chat (mission §"le Chat cite ses
 * sources" / §"explicit 'I don't know' behavior") — `citations` est vérifié après coup par
 * `chat-citation-validator.ts` (jamais une confiance auto-déclarée par le modèle, même motif que
 * `CriterionResponseOutputSchema`, module Generation). `insufficientContext: true` est le mécanisme
 * explicite anti-hallucination : le modèle DOIT l'utiliser plutôt que d'inventer un fait absent du
 * contexte fourni.
 */
export const ChatResponseOutputSchema = z
  .object({
    answer: z.string().min(1),
    citations: z
      .array(
        z.object({
          sourceRef: z.string().min(1),
          excerpt: z.string().optional(),
        }),
      )
      .default([]),
    insufficientContext: z.boolean().default(false),
  })
  .strict();

export type ChatResponseOutput = z.infer<typeof ChatResponseOutputSchema>;
