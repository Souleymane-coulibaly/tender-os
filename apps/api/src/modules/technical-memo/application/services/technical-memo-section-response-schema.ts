import { z } from "zod";

/** Sortie structurée attendue du modèle pour UNE section (mission §32 "SectionGenerationContext" +
 *  §34 prompt système) — `.strict()` rejette toute clé inattendue, même motif que
 *  `ChatResponseOutputSchema` (Sprint 9). `missingDataNotes` est l'équivalent section-par-section de
 *  `insufficientContext` du Chat, mais peut lister PLUSIEURS lacunes distinctes (mission §36). */
export const TechnicalMemoSectionResponseSchema = z
  .object({
    content: z.string().min(1),
    citations: z.array(z.object({ sourceRef: z.string().min(1), excerpt: z.string().optional() })).default([]),
    missingDataNotes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type TechnicalMemoSectionResponseOutput = z.infer<typeof TechnicalMemoSectionResponseSchema>;
