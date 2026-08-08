import type { z } from "zod";
import { KnowledgeCategory } from "../../../domain/knowledge-category";
import { KnowledgeMetadataValidationFailedError } from "../../../domain/errors";
import { CertificationMetadataSchema } from "./certification.schema";
import { ClientReferenceMetadataSchema } from "./client-reference.schema";
import { ConsultantProfileMetadataSchema } from "./consultant-profile.schema";
import { GenericMetadataSchema } from "./generic-metadata.schema";

/** Un schéma de métadonnées PAR CATÉGORIE (mission Sprint 5 §5) — les 3 catégories détaillées par
 *  la mission ont un schéma dédié, toutes les autres partagent le schéma générique borné. Jamais
 *  un moteur de formulaire dynamique : ajouter une catégorie nécessite d'ajouter une entrée ici,
 *  jamais une configuration à l'exécution. */
const METADATA_SCHEMA_BY_CATEGORY: Record<KnowledgeCategory, z.ZodTypeAny> = {
  [KnowledgeCategory.ClientReference]: ClientReferenceMetadataSchema,
  [KnowledgeCategory.ConsultantProfile]: ConsultantProfileMetadataSchema,
  [KnowledgeCategory.Certification]: CertificationMetadataSchema,
  [KnowledgeCategory.CompanyPresentation]: GenericMetadataSchema,
  [KnowledgeCategory.Methodology]: GenericMetadataSchema,
  [KnowledgeCategory.ServiceOffer]: GenericMetadataSchema,
  [KnowledgeCategory.CaseStudy]: GenericMetadataSchema,
  [KnowledgeCategory.Security]: GenericMetadataSchema,
  [KnowledgeCategory.Gdpr]: GenericMetadataSchema,
  [KnowledgeCategory.Csr]: GenericMetadataSchema,
  [KnowledgeCategory.Administrative]: GenericMetadataSchema,
  [KnowledgeCategory.TechnicalMemory]: GenericMetadataSchema,
  [KnowledgeCategory.ResponseTemplate]: GenericMetadataSchema,
  [KnowledgeCategory.CommercialDocument]: GenericMetadataSchema,
  [KnowledgeCategory.Image]: GenericMetadataSchema,
  [KnowledgeCategory.Other]: GenericMetadataSchema,
};

/** Ne fait jamais confiance au JSON brut soumis par l'appelant (mission §"Toute donnée JSON doit
 *  être validée") — toute valeur qui ne satisfait pas le schéma de la catégorie échoue avec
 *  `KNOWLEDGE_METADATA_VALIDATION_FAILED`, jamais silencieusement acceptée ni tronquée. */
export function validateKnowledgeMetadata(category: KnowledgeCategory, raw: unknown): Record<string, unknown> {
  const schema = METADATA_SCHEMA_BY_CATEGORY[category];
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    throw new KnowledgeMetadataValidationFailedError({
      reason: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
  }
  return result.data as Record<string, unknown>;
}
