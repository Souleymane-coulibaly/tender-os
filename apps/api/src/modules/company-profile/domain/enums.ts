export const CompanyRepresentativeType = {
  LegalRepresentative: "LEGAL_REPRESENTATIVE",
  Signatory: "SIGNATORY",
  AdministrativeContact: "ADMINISTRATIVE_CONTACT",
  CommercialContact: "COMMERCIAL_CONTACT",
  TechnicalContact: "TECHNICAL_CONTACT",
} as const;
export type CompanyRepresentativeType = (typeof CompanyRepresentativeType)[keyof typeof CompanyRepresentativeType];

export const CompanyInsuranceType = {
  ProfessionalLiability: "PROFESSIONAL_LIABILITY",
  Decennial: "DECENNIAL",
  OperatingLiability: "OPERATING_LIABILITY",
  SectorSpecific: "SECTOR_SPECIFIC",
  Other: "OTHER",
} as const;
export type CompanyInsuranceType = (typeof CompanyInsuranceType)[keyof typeof CompanyInsuranceType];

export const CompanyReferenceConfidentiality = { Standard: "STANDARD", Confidential: "CONFIDENTIAL" } as const;
export type CompanyReferenceConfidentiality = (typeof CompanyReferenceConfidentiality)[keyof typeof CompanyReferenceConfidentiality];

export const CompanyReferenceStatus = { Draft: "DRAFT", Validated: "VALIDATED", Archived: "ARCHIVED" } as const;
export type CompanyReferenceStatus = (typeof CompanyReferenceStatus)[keyof typeof CompanyReferenceStatus];

export const MaterialResourceAvailability = { Available: "AVAILABLE", InUse: "IN_USE", Unavailable: "UNAVAILABLE" } as const;
export type MaterialResourceAvailability = (typeof MaterialResourceAvailability)[keyof typeof MaterialResourceAvailability];

export const MaterialResourceOwnership = { Owned: "OWNED", Leased: "LEASED" } as const;
export type MaterialResourceOwnership = (typeof MaterialResourceOwnership)[keyof typeof MaterialResourceOwnership];

export const CompanyDocumentCategory = {
  Kbis: "KBIS",
  TaxCertificate: "TAX_CERTIFICATE",
  SocialCertificate: "SOCIAL_CERTIFICATE",
  ArticlesOfAssociation: "ARTICLES_OF_ASSOCIATION",
  Other: "OTHER",
} as const;
export type CompanyDocumentCategory = (typeof CompanyDocumentCategory)[keyof typeof CompanyDocumentCategory];

/** ACTIVE | ARCHIVED — statut simple partagé par la majorité des satellites (mission : archivage
 *  plutôt que suppression physique). */
export const SatelliteStatus = { Active: "ACTIVE", Archived: "ARCHIVED" } as const;
export type SatelliteStatus = (typeof SatelliteStatus)[keyof typeof SatelliteStatus];

/** Statut TEMPOREL calculé à la lecture (jamais stocké) pour assurances/certifications — mission
 *  §4.5/§4.6. */
export const TemporalValidityStatus = { Valid: "VALID", ExpiringSoon: "EXPIRING_SOON", Expired: "EXPIRED", NoExpiry: "NO_EXPIRY" } as const;
export type TemporalValidityStatus = (typeof TemporalValidityStatus)[keyof typeof TemporalValidityStatus];

const EXPIRING_SOON_WINDOW_DAYS = 30;

export function computeTemporalValidityStatus(expiresAt: Date | null | undefined, now: Date): TemporalValidityStatus {
  if (!expiresAt) {
    return TemporalValidityStatus.NoExpiry;
  }
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return TemporalValidityStatus.Expired;
  if (daysUntilExpiry <= EXPIRING_SOON_WINDOW_DAYS) return TemporalValidityStatus.ExpiringSoon;
  return TemporalValidityStatus.Valid;
}
