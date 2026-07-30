import { z } from "zod";

/** Métadonnées d'une certification (mission Sprint 5 §5). */
export const CertificationMetadataSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    issuer: z.string().max(300).optional(),
    issueDate: z.string().datetime().optional(),
    expiryDate: z.string().datetime().optional(),
    certificateNumber: z.string().max(200).optional(),
    proofDocumentId: z.string().uuid().optional(),
  })
  .strict();

export type CertificationMetadata = z.infer<typeof CertificationMetadataSchema>;
