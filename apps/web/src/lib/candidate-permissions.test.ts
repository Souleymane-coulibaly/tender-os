import { describe, expect, it } from "vitest";
import { CandidatePermission, resolveCandidateUiCapabilities, roleHasCandidatePermission, ROLE_CANDIDATE_PERMISSIONS } from "./candidate-permissions";

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — la matrice d'interface doit correspondre EXACTEMENT à la matrice
 * backend `CandidatePermission` (CCV2-A). Une divergence produirait soit une action proposée puis
 * refusée en 403, soit une action légitime rendue introuvable.
 *
 * Les huit rôles et leurs sept permissions sont vérifiés un à un, sans boucle générique : une
 * boucle qui lit la même table qu'elle teste ne prouverait rien.
 */
describe("CCV2-F — matrice de permissions candidate côté interface", () => {
  const ROLES = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"];

  it("couvre exactement les huit rôles d'organisation", () => {
    expect(Object.keys(ROLE_CANDIDATE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it("refuse par défaut un rôle inconnu ou absent", () => {
    for (const permission of Object.values(CandidatePermission)) {
      expect(roleHasCandidatePermission(undefined, permission)).toBe(false);
      expect(roleHasCandidatePermission("PAS_UN_ROLE", permission)).toBe(false);
    }
    const none = resolveCandidateUiCapabilities(undefined);
    expect(Object.values(none).every((allowed) => allowed === false)).toBe(true);
  });

  it("OWNER et ORGANIZATION_ADMIN : accès complet", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      expect(resolveCandidateUiCapabilities(role)).toEqual({
        canRead: true,
        canEditIdentity: true,
        canEditCapabilities: true,
        canUploadDocuments: true,
        canDeleteDocuments: true,
        canReadBanking: true,
        canManageBanking: true,
      });
    }
  });

  it("BID_MANAGER : accès complet, banking inclus", () => {
    expect(resolveCandidateUiCapabilities("BID_MANAGER")).toEqual({
      canRead: true,
      canEditIdentity: true,
      canEditCapabilities: true,
      canUploadDocuments: true,
      canDeleteDocuments: true,
      canReadBanking: true,
      canManageBanking: true,
    });
  });

  it("CONTRIBUTOR : édite les capacités et téléverse, mais ne supprime pas et ne voit aucun banking", () => {
    expect(resolveCandidateUiCapabilities("CONTRIBUTOR")).toEqual({
      canRead: true,
      canEditIdentity: false,
      canEditCapabilities: true,
      canUploadDocuments: true,
      canDeleteDocuments: false,
      canReadBanking: false,
      canManageBanking: false,
    });
  });

  it.each(["REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"])("%s : lecture seule stricte, aucun banking", (role) => {
    expect(resolveCandidateUiCapabilities(role)).toEqual({
      canRead: true,
      canEditIdentity: false,
      canEditCapabilities: false,
      canUploadDocuments: false,
      canDeleteDocuments: false,
      canReadBanking: false,
      canManageBanking: false,
    });
  });

  it("le banking est accordé à strictement moins de rôles que la lecture", () => {
    const readers = ROLES.filter((role) => roleHasCandidatePermission(role, CandidatePermission.Read));
    const bankingReaders = ROLES.filter((role) => roleHasCandidatePermission(role, CandidatePermission.ReadBanking));
    expect(readers).toHaveLength(8);
    expect(bankingReaders).toHaveLength(3);
    for (const role of bankingReaders) expect(readers).toContain(role);
  });
});
