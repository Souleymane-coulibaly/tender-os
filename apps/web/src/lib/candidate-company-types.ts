/** Checkpoint 2.1-A5 — types cote frontend pour CandidateCompany/CandidateEstablishment (A1-A4),
 *  memes formes que les DTO exposes par l'API
 *  (apps/api/src/modules/candidate-company/application/dtos.ts), jamais une redefinition
 *  divergente. Distinct de ClientAccount (client-portfolio-types.ts) : CandidateCompany est
 *  l'entite JURIDIQUE qui repond a un Tender, ClientAccount est la relation commerciale/le
 *  portefeuille — les deux ne sont jamais fusionnes (mission A5 §11). */

export type CandidateCompanyStatus = "ACTIVE" | "ARCHIVED";

export const CANDIDATE_COMPANY_STATUS_LABELS: Record<CandidateCompanyStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archivée",
};

export function candidateCompanyStatusBadgeClass(status: CandidateCompanyStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "ARCHIVED":
      return "bg-neutral-100 text-neutral-500";
  }
}

export type CandidateCompanySummary = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string | undefined;
  /** Checkpoint CCV2-F.2 — nom commercial, distinct de la raison sociale. */
  tradeName?: string | undefined;
  siren?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  status: CandidateCompanyStatus;
  sourceClientAccountId?: string | undefined;
  createdBy: string;
  updatedBy?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type CandidateEstablishmentSummary = {
  id: string;
  organizationId: string;
  candidateCompanyId: string;
  siret: string;
  label?: string | undefined;
  isPrincipal: boolean;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateCompanyPage = { items: CandidateCompanySummary[]; nextCursor: string | null; total: number };

/** Nom d'usage — mirroir de la regle backend ResolveCandidateIdentityUseCase (legalName sert de
 *  nom d'usage lorsque renseigne, sinon name), jamais une seconde regle divergente cote UI. */
export function candidateCompanyDisplayName(company: CandidateCompanySummary): string {
  return company.legalName ?? company.name;
}

/** Le backend n'a PAS encore de permission dediee CandidateCompany (mission A1 "CandidatePermission
 *  explicitement differe") — l'autorisation reelle est "membre de l'organisation" uniquement
 *  (`OrganizationMembershipGuard`). Ce gate cote UI reste donc large a dessein, jamais plus
 *  restrictif que ce que le backend autorise reellement (mission A5 §45). */
export function canManageCandidateCompany(role: string | undefined): boolean {
  return role !== undefined;
}
