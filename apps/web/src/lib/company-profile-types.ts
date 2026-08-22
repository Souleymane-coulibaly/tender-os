/** Mission V2 Sprint 2 — types de la fiche "Profil entreprise du client" (module backend
 *  `company-profile`, historiquement appelée "Entreprise candidate" côté UI avant le Checkpoint
 *  2.1-A5 — renommée pour ne plus entrer en collision avec CandidateCompany, voir
 *  candidate-company-types.ts). Les champs nullable côté Prisma arrivent en JSON comme `null` —
 *  traités ici comme `T | null | undefined`, même convention que `ClientAccountSummary`. */

import type { BadgeTone } from "../components/ui/badge";

export type CompanyLegalIdentity = {
  id: string;
  clientAccountId: string;
  legalName?: string | null;
  tradeName?: string | null;
  siren?: string | null;
  siretPrincipal?: string | null;
  vatNumber?: string | null;
  legalForm?: string | null;
  shareCapitalAmount?: string | null;
  shareCapitalCurrency?: string | null;
  apeCode?: string | null;
  incorporatedAt?: string | null;
  rcsNumber?: string | null;
  rcsCity?: string | null;
  registrationCountry?: string | null;
  addressLine?: string | null;
  addressComplement?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  phone?: string | null;
  generalEmail?: string | null;
  website?: string | null;
  status: string;
};

export const REPRESENTATIVE_TYPES = ["LEGAL_REPRESENTATIVE", "SIGNATORY", "ADMINISTRATIVE_CONTACT", "COMMERCIAL_CONTACT", "TECHNICAL_CONTACT"] as const;
export type RepresentativeType = (typeof REPRESENTATIVE_TYPES)[number];
export const REPRESENTATIVE_TYPE_LABELS: Record<RepresentativeType, string> = {
  LEGAL_REPRESENTATIVE: "Représentant légal",
  SIGNATORY: "Signataire",
  ADMINISTRATIVE_CONTACT: "Contact administratif",
  COMMERCIAL_CONTACT: "Contact commercial",
  TECHNICAL_CONTACT: "Contact technique",
};

export type CompanyRepresentative = {
  id: string;
  firstName: string;
  lastName: string;
  type: RepresentativeType;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  signatureScope?: string | null;
  status: string;
};

export type CompanyBankAccount = {
  id: string;
  accountHolder: string;
  bankName?: string | null;
  iban: string;
  bic?: string | null;
  isPrimary: boolean;
  status: string;
};

export const INSURANCE_TYPES = ["PROFESSIONAL_LIABILITY", "DECENNIAL", "OPERATING_LIABILITY", "SECTOR_SPECIFIC", "OTHER"] as const;
export type InsuranceType = (typeof INSURANCE_TYPES)[number];
export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  PROFESSIONAL_LIABILITY: "Responsabilité civile professionnelle",
  DECENNIAL: "Décennale",
  OPERATING_LIABILITY: "Responsabilité civile exploitation",
  SECTOR_SPECIFIC: "Sectorielle",
  OTHER: "Autre",
};

export type CompanyInsurance = {
  id: string;
  type: InsuranceType;
  otherTypeLabel?: string | null;
  insurer?: string | null;
  policyNumber?: string | null;
  expiresAt?: string | null;
  status: string;
  temporalStatus?: TemporalValidityStatus;
};

export type CompanyCertification = {
  id: string;
  name: string;
  issuer?: string | null;
  number?: string | null;
  expiresAt?: string | null;
  status: string;
  temporalStatus?: TemporalValidityStatus;
};

export type CompanyReference = {
  id: string;
  projectName: string;
  referenceClientName?: string | null;
  sector?: string | null;
  amountValue?: string | null;
  amountCurrency?: string | null;
  confidentiality: string;
  status: string;
};

export type CompanyHumanResource = {
  id: string;
  category: string;
  title: string;
  headcount: number;
  qualification?: string | null;
  status: string;
};

export type CompanyMaterialResource = {
  id: string;
  category: string;
  name: string;
  quantity: number;
  availabilityStatus: string;
  status: string;
};

export type DocumentClientAccountAssociation = {
  id: string;
  documentId: string;
  category: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

export type TemporalValidityStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";
export type CompanyProfileCategoryStatus = "COMPLETE" | "PARTIAL" | "MISSING" | "EXPIRED" | "TO_VERIFY";

/** Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2, audit hardcode) — `TEMPORAL_LABELS`/
 *  `TEMPORAL_BADGE` étaient dupliqués à l'identique (octet pour octet) dans
 *  `certifications-section.tsx` et `insurances-section.tsx`, jamais convergés vers une seule source
 *  malgré le même type `TemporalValidityStatus` déjà importé des deux côtés. `temporalValidityTone`
 *  remplace `TEMPORAL_BADGE` (classes brutes) par le même motif `BadgeTone` que `deadlineBucketTone`/
 *  `toneFor` ailleurs dans l'app, consommé via `&lt;Badge tone={...}&gt;`. */
export const TEMPORAL_VALIDITY_LABELS: Record<TemporalValidityStatus, string> = {
  VALID: "Valide",
  EXPIRING_SOON: "Bientôt expirée",
  EXPIRED: "Expirée",
  NO_EXPIRY: "Sans échéance",
};

export function temporalValidityTone(status: TemporalValidityStatus): BadgeTone {
  switch (status) {
    case "VALID":
      return "success";
    case "EXPIRING_SOON":
      return "warning";
    case "EXPIRED":
      return "danger";
    case "NO_EXPIRY":
      return "neutral";
  }
}

export const CATEGORY_STATUS_LABELS: Record<CompanyProfileCategoryStatus, string> = {
  COMPLETE: "Complet",
  PARTIAL: "Partiel",
  MISSING: "Manquant",
  EXPIRED: "Expiré",
  TO_VERIFY: "À vérifier",
};

export function categoryStatusBadgeClass(status: CompanyProfileCategoryStatus): string {
  switch (status) {
    case "COMPLETE":
      return "bg-green-100 text-green-800";
    case "PARTIAL":
    case "TO_VERIFY":
      return "bg-amber-100 text-amber-800";
    case "MISSING":
      return "bg-neutral-200 text-neutral-700";
    case "EXPIRED":
      return "bg-red-100 text-red-800";
  }
}

export type CompanyProfileSummary = {
  clientAccountId: string;
  legalIdentity: CompanyLegalIdentity | null;
  representatives: CompanyRepresentative[];
  bankAccounts: CompanyBankAccount[];
  insurances: CompanyInsurance[];
  certifications: CompanyCertification[];
  references: CompanyReference[];
  humanResources: CompanyHumanResource[];
  materialResources: CompanyMaterialResource[];
  documents: DocumentClientAccountAssociation[];
  completeness: Record<"identity" | "banking" | "insurances" | "certifications" | "references" | "resources" | "documents", CompanyProfileCategoryStatus>;
};
