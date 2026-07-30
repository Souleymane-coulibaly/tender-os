import { InvalidClientRoleError } from "./errors";

/**
 * Rôle CLIENT (mission Sprint 5.1 §"ClientAssignment") — distinct et complémentaire du rôle
 * d'organisation (`OrganizationRole`, module Memberships), jamais un remplacement : le rôle
 * d'organisation reste prioritaire (OWNER/ADMIN voient tous les clients, voir
 * `client-access.policy.ts`), le rôle client ne s'applique qu'aux acteurs affectés explicitement.
 */
export const ClientRole = {
  ClientManager: "CLIENT_MANAGER",
  Contributor: "CONTRIBUTOR",
  Viewer: "VIEWER",
} as const;

export type ClientRole = (typeof ClientRole)[keyof typeof ClientRole];

export function isClientRole(value: string): value is ClientRole {
  return Object.values(ClientRole).includes(value as ClientRole);
}

export function parseClientRole(value: string): ClientRole {
  if (!isClientRole(value)) {
    throw new InvalidClientRoleError(value);
  }
  return value;
}
