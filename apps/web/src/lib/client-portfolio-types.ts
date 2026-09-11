import type { BadgeTone } from "../components/ui";

export type ClientPortfolioPage<T> ={ items: T[]; nextCursor: string | null; total: number };

export type ClientAccountStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export const CLIENT_ACCOUNT_STATUS_LABELS: Record<ClientAccountStatus, string> = {
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  ARCHIVED: "Archivé",
};

/**
 * Design System — table STATUT → tone du `Badge`, remplace l'ancien `clientAccountStatusBadgeClass()`
 * qui reproduisait à la main des classes de badge (vert pour actif, gris pour inactif/archivé).
 */
export const CLIENT_ACCOUNT_STATUS_TONE: Record<ClientAccountStatus, BadgeTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  ARCHIVED: "neutral",
};

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
