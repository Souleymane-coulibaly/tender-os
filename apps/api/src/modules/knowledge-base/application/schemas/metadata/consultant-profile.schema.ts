import { z } from "zod";

/** Métadonnées d'un profil consultant / CV (mission Sprint 5 §5). */
export const ConsultantProfileMetadataSchema = z
  .object({
    fullName: z.string().min(1).max(200).optional(),
    role: z.string().max(200).optional(),
    yearsOfExperience: z.number().min(0).max(80).optional(),
    skills: z.array(z.string().max(100)).max(100).optional(),
    certifications: z.array(z.string().max(200)).max(50).optional(),
    availability: z.string().max(200).optional(),
    languages: z.array(z.string().max(50)).max(20).optional(),
  })
  .strict();

export type ConsultantProfileMetadata = z.infer<typeof ConsultantProfileMetadataSchema>;
