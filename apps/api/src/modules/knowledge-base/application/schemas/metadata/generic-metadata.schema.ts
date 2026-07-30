import { z } from "zod";

/** Métadonnées génériques (mission Sprint 5 §5 "Ne pas construire un moteur dynamique complexe de
 *  formulaires") — utilisées pour toute catégorie sans schéma dédié (COMPANY_PRESENTATION,
 *  METHODOLOGY, SERVICE_OFFER, CASE_STUDY, SECURITY, GDPR, CSR, ADMINISTRATIVE, TECHNICAL_MEMORY,
 *  RESPONSE_TEMPLATE, COMMERCIAL_DOCUMENT, OTHER) : un objet plat borné, jamais une structure
 *  arbitrairement imbriquée — reste un JSON structuré validé, jamais une chaîne libre non
 *  contrôlée. */
const primitiveValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(500)).max(50)]);

export const GenericMetadataSchema = z
  .record(z.string().min(1).max(100), primitiveValue)
  .refine((value) => Object.keys(value).length <= 40, { message: "at most 40 metadata fields are allowed" });

export type GenericMetadata = z.infer<typeof GenericMetadataSchema>;
