import { InvalidClientAccountStatusError } from "./errors";

/**
 * Cycle de vie d'un `ClientAccount` (mission Sprint 5.1 §"Statuts possibles") — `ACTIVE` par
 * défaut à la création ; `INACTIVE` signale un client géré mais temporairement en pause (jamais
 * automatique, décision manuelle) ; `ARCHIVED` exclut le client des listes normales et de la
 * sélection pour un nouveau Tender (mission §"client archivé non sélectionnable").
 */
export const ClientAccountStatus = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Archived: "ARCHIVED",
} as const;

export type ClientAccountStatus = (typeof ClientAccountStatus)[keyof typeof ClientAccountStatus];

export const ALLOWED_CLIENT_ACCOUNT_TRANSITIONS: Record<ClientAccountStatus, readonly ClientAccountStatus[]> = {
  [ClientAccountStatus.Active]: [ClientAccountStatus.Inactive, ClientAccountStatus.Archived],
  [ClientAccountStatus.Inactive]: [ClientAccountStatus.Active, ClientAccountStatus.Archived],
  // Mission §11-like "restauration ramène à un statut utilisable simple" — toujours ACTIVE,
  // jamais une reconstruction d'un statut INACTIVE antérieur (cohérent avec Knowledge Base).
  [ClientAccountStatus.Archived]: [ClientAccountStatus.Active],
};

export function isClientAccountStatus(value: string): value is ClientAccountStatus {
  return Object.values(ClientAccountStatus).includes(value as ClientAccountStatus);
}

export function parseClientAccountStatus(value: string): ClientAccountStatus {
  if (!isClientAccountStatus(value)) {
    throw new InvalidClientAccountStatusError(value);
  }
  return value;
}
