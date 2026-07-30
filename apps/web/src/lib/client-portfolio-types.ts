export type ClientPortfolioPage<T> = { items: T[]; nextCursor: string | null; total: number };

export type ClientAccountStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export const CLIENT_ACCOUNT_STATUS_LABELS: Record<ClientAccountStatus, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  ARCHIVED: "Archivé",
};

export function clientAccountStatusBadgeClass(status: ClientAccountStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "INACTIVE":
      return "bg-neutral-200 text-neutral-700";
    case "ARCHIVED":
      return "bg-neutral-100 text-neutral-500";
  }
}

export type ClientAccountSummary = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string;
  reference?: string;
  sector?: string;
  country?: string;
  address?: string;
  website?: string;
  notes?: string;
  status: ClientAccountStatus;
  createdBy: string;
  updatedBy?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientRole = "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER";

export const CLIENT_ROLES: readonly ClientRole[] = ["CLIENT_MANAGER", "CONTRIBUTOR", "VIEWER"];

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  CLIENT_MANAGER: "Gestionnaire client",
  CONTRIBUTOR: "Contributeur",
  VIEWER: "Lecteur",
};

export type ClientAssignmentSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  userId: string;
  role: ClientRole;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientAssignmentView = ClientAssignmentSummary & {
  user: { id: string; email: string; displayName: string };
};
