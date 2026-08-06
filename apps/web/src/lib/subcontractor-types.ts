export type SubcontractorProfileStatus = "TO_VERIFY" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

export const SUBCONTRACTOR_PROFILE_STATUSES: readonly SubcontractorProfileStatus[] = ["TO_VERIFY", "ACTIVE", "INACTIVE", "ARCHIVED"];

export const SUBCONTRACTOR_PROFILE_STATUS_LABELS: Record<SubcontractorProfileStatus, string> = {
  TO_VERIFY: "À vérifier",
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  ARCHIVED: "Archivé",
};

export function subcontractorProfileStatusBadgeClass(status: SubcontractorProfileStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "TO_VERIFY":
      return "bg-amber-100 text-amber-800";
    case "INACTIVE":
      return "bg-neutral-200 text-neutral-700";
    case "ARCHIVED":
      return "bg-neutral-100 text-neutral-500";
  }
}

export type SubcontractorProfile = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  siren?: string | null;
  siret?: string | null;
  legalForm?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  legalRepresentativeName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  skills?: string | null;
  domains?: string | null;
  bankAccountHolder?: string | null;
  iban?: string | null;
  bic?: string | null;
  status: SubcontractorProfileStatus;
  createdAt: string;
  updatedAt: string;
};

export type SubcontractorReference = {
  id: string;
  projectName: string;
  clientName?: string | null;
  description?: string | null;
  status: string;
};

export type SubcontractorCertification = {
  id: string;
  name: string;
  issuer?: string | null;
  expiresAt?: string | null;
  status: string;
};

export type SubcontractorInsurance = {
  id: string;
  type: string;
  insurer?: string | null;
  expiresAt?: string | null;
  status: string;
};

export type SubcontractorProfileDocument = {
  id: string;
  documentId: string;
  category: string;
  createdAt: string;
};
