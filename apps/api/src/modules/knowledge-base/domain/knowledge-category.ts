import { InvalidKnowledgeCategoryError } from "./errors";

/**
 * Catégorie structurée d'une entrée de connaissance (mission Sprint 5 §3) — typée et validée,
 * jamais une chaîne libre : détermine à la fois le filtre de recherche et le schéma de
 * métadonnées attendu (voir `application/schemas/metadata`).
 */
export const KnowledgeCategory = {
  CompanyPresentation: "COMPANY_PRESENTATION",
  ClientReference: "CLIENT_REFERENCE",
  ConsultantProfile: "CONSULTANT_PROFILE",
  Certification: "CERTIFICATION",
  Methodology: "METHODOLOGY",
  ServiceOffer: "SERVICE_OFFER",
  CaseStudy: "CASE_STUDY",
  Security: "SECURITY",
  Gdpr: "GDPR",
  Csr: "CSR",
  Administrative: "ADMINISTRATIVE",
  TechnicalMemory: "TECHNICAL_MEMORY",
  ResponseTemplate: "RESPONSE_TEMPLATE",
  CommercialDocument: "COMMERCIAL_DOCUMENT",
  Other: "OTHER",
} as const;

export type KnowledgeCategory = (typeof KnowledgeCategory)[keyof typeof KnowledgeCategory];

export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return Object.values(KnowledgeCategory).includes(value as KnowledgeCategory);
}

export function parseKnowledgeCategory(value: string): KnowledgeCategory {
  if (!isKnowledgeCategory(value)) {
    throw new InvalidKnowledgeCategoryError(value);
  }
  return value;
}
