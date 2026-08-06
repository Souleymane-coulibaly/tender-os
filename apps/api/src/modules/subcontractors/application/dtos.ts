export type SubcontractorProfileRecord = Readonly<{
  id: string;
  organizationId: string;
  legalName: string;
  tradeName: string | null;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  legalForm: string | null;
  apeCode: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  legalRepresentativeName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  skills: string | null;
  domains: string | null;
  humanResourcesSummary: string | null;
  materialResourcesSummary: string | null;
  bankAccountHolder: string | null;
  iban: string | null;
  bic: string | null;
  bankDocumentId: string | null;
  status: string;
  createdBy: string;
  updatedBy: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SubcontractorReferenceRecord = Readonly<{
  id: string;
  organizationId: string;
  subcontractorProfileId: string;
  projectName: string;
  clientName: string | null;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SubcontractorCertificationRecord = Readonly<{
  id: string;
  organizationId: string;
  subcontractorProfileId: string;
  name: string;
  issuer: string | null;
  number: string | null;
  obtainedAt: Date | null;
  expiresAt: Date | null;
  documentId: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SubcontractorInsuranceRecord = Readonly<{
  id: string;
  organizationId: string;
  subcontractorProfileId: string;
  type: string;
  insurer: string | null;
  policyNumber: string | null;
  expiresAt: Date | null;
  documentId: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SubcontractorProfileDocumentRecord = Readonly<{
  id: string;
  organizationId: string;
  subcontractorProfileId: string;
  documentId: string;
  category: string;
  createdByUserId: string;
  createdAt: Date;
}>;
