/** Types d'enregistrement partagés (lecture) pour tous les satellites "Entreprise candidate". */

export type CompanyLegalIdentityRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  legalName: string | null;
  tradeName: string | null;
  siren: string | null;
  siretPrincipal: string | null;
  vatNumber: string | null;
  legalForm: string | null;
  shareCapitalAmount: string | null;
  shareCapitalCurrency: string | null;
  apeCode: string | null;
  incorporatedAt: Date | null;
  rcsNumber: string | null;
  rcsCity: string | null;
  registrationCountry: string | null;
  addressLine: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  generalEmail: string | null;
  website: string | null;
  status: string;
  lastValidatedAt: Date | null;
  lastValidatedByUserId: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyRepresentativeRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  firstName: string;
  lastName: string;
  type: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  signatureScope: string | null;
  signatureLimitations: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyBankAccountRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  accountHolder: string;
  bankName: string | null;
  iban: string;
  bic: string | null;
  country: string | null;
  currency: string | null;
  documentId: string | null;
  isPrimary: boolean;
  validatedAt: Date | null;
  validatedByUserId: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyInsuranceRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  type: string;
  otherTypeLabel: string | null;
  insurer: string | null;
  policyNumber: string | null;
  startDate: Date | null;
  expiresAt: Date | null;
  coverageScope: string | null;
  coverageAmount: string | null;
  coverageCurrency: string | null;
  documentId: string | null;
  lastVerifiedAt: Date | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyCertificationRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  name: string;
  issuer: string | null;
  number: string | null;
  type: string | null;
  scope: string | null;
  obtainedAt: Date | null;
  expiresAt: Date | null;
  documentId: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyReferenceRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  projectName: string;
  referenceClientName: string | null;
  sector: string | null;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  amountValue: string | null;
  amountCurrency: string | null;
  companyRole: string | null;
  lotsOrServices: string | null;
  skillsOrTechnologies: string | null;
  results: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  confidentiality: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyReferenceDocumentRecord = Readonly<{
  id: string;
  organizationId: string;
  companyReferenceId: string;
  documentId: string;
  createdByUserId: string;
  createdAt: Date;
}>;

export type CompanyHumanResourceRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  category: string;
  title: string;
  headcount: number;
  qualification: string | null;
  averageExperienceYears: number | null;
  skills: string | null;
  certifications: string | null;
  availabilityNote: string | null;
  location: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CompanyMaterialResourceRecord = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  category: string;
  name: string;
  description: string | null;
  quantity: number;
  characteristics: string | null;
  location: string | null;
  availabilityStatus: string;
  ownershipType: string | null;
  documentId: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type DocumentClientAccountAssociationRecord = Readonly<{
  id: string;
  organizationId: string;
  documentId: string;
  clientAccountId: string;
  category: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
}>;
