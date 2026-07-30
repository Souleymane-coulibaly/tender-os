import { z } from "zod";

/** Métadonnées d'une référence client (mission Sprint 5 §5). */
export const ClientReferenceMetadataSchema = z
  .object({
    clientName: z.string().min(1).max(300).optional(),
    sector: z.string().max(200).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    amount: z.number().min(0).optional(),
    currency: z.string().length(3).optional(),
    technologies: z.array(z.string().max(100)).max(50).optional(),
    location: z.string().max(200).optional(),
    contactAvailable: z.boolean().optional(),
    proofAvailable: z.boolean().optional(),
  })
  .strict();

export type ClientReferenceMetadata = z.infer<typeof ClientReferenceMetadataSchema>;
