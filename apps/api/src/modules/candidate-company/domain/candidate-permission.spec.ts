import { describe, expect, it } from "vitest";
import { OrganizationRole } from "../../memberships/domain/organization-role";
import { ClientPermission, ROLE_CLIENT_ACTION_PERMISSIONS } from "../../client-portfolio/domain/client-permission";
import { ClientRole } from "../../client-portfolio/domain/client-role";
import { CandidatePermissionMissingError } from "./errors";
import { assertHasCandidatePermission, CandidatePermission, roleHasCandidatePermission, ROLE_CANDIDATE_PERMISSIONS } from "./candidate-permission";

/**
 * Checkpoint TENDEROS-2.1-CCV2-A — matrice d'autorisation candidate.
 *
 * Ces assertions sont la preuve de sécurité de référence pour les permissions dont la surface HTTP
 * n'arrive qu'en CCV2-C/C.1 (documents, banking) : le CONTRAT est figé et vérifié ici AVANT que la
 * moindre donnée sensible ne soit repointée vers `CandidateCompany` (finding CCV2-P0-01).
 */
describe("CandidatePermission — matrice de rôles (CCV2-A)", () => {
  const ALL_ROLES = Object.values(OrganizationRole);

  it("couvre exactement les 8 rôles d'organisation, sans rôle orphelin ni rôle inventé", () => {
    expect(Object.keys(ROLE_CANDIDATE_PERMISSIONS).sort()).toEqual([...ALL_ROLES].sort());
  });

  it("refuse par défaut tout rôle inconnu (PERM-001), jamais un accès implicite", () => {
    for (const permission of Object.values(CandidatePermission)) {
      expect(roleHasCandidatePermission("SOMETHING_ELSE", permission)).toBe(false);
      expect(roleHasCandidatePermission("", permission)).toBe(false);
    }
  });

  it("accorde la LECTURE à tous les rôles actifs, y compris EXTERNAL_CONSULTANT et READ_ONLY", () => {
    for (const role of ALL_ROLES) {
      expect(roleHasCandidatePermission(role, CandidatePermission.Read)).toBe(true);
    }
  });

  describe("preuves négatives obligatoires (mission CCV2-A)", () => {
    it("EXTERNAL_CONSULTANT ne peut pas lire le banking", () => {
      expect(roleHasCandidatePermission(OrganizationRole.ExternalConsultant, CandidatePermission.ReadBanking)).toBe(false);
      expect(roleHasCandidatePermission(OrganizationRole.ExternalConsultant, CandidatePermission.ManageBanking)).toBe(false);
    });

    it("READ_ONLY ne peut pas lire le banking", () => {
      expect(roleHasCandidatePermission(OrganizationRole.ReadOnly, CandidatePermission.ReadBanking)).toBe(false);
      expect(roleHasCandidatePermission(OrganizationRole.ReadOnly, CandidatePermission.ManageBanking)).toBe(false);
    });

    it("CONTRIBUTOR ne peut pas lire le banking", () => {
      expect(roleHasCandidatePermission(OrganizationRole.Contributor, CandidatePermission.ReadBanking)).toBe(false);
      expect(roleHasCandidatePermission(OrganizationRole.Contributor, CandidatePermission.ManageBanking)).toBe(false);
    });

    it("CONTRIBUTOR ne peut pas supprimer un document", () => {
      expect(roleHasCandidatePermission(OrganizationRole.Contributor, CandidatePermission.DocumentDelete)).toBe(false);
    });

    it("CONTRIBUTOR peut modifier une capacité et téléverser un document", () => {
      expect(roleHasCandidatePermission(OrganizationRole.Contributor, CandidatePermission.CapabilityEdit)).toBe(true);
      expect(roleHasCandidatePermission(OrganizationRole.Contributor, CandidatePermission.DocumentUpload)).toBe(true);
    });

    it("BID_MANAGER peut gérer les capacités, les documents et le banking", () => {
      for (const permission of Object.values(CandidatePermission)) {
        expect(roleHasCandidatePermission(OrganizationRole.BidManager, permission)).toBe(true);
      }
    });

    it("OWNER et ORGANIZATION_ADMIN conservent l'accès complet", () => {
      for (const role of [OrganizationRole.Owner, OrganizationRole.OrganizationAdmin]) {
        for (const permission of Object.values(CandidatePermission)) {
          expect(roleHasCandidatePermission(role, permission)).toBe(true);
        }
      }
    });

    it("REVIEWER et EXECUTIVE sont en lecture stricte — aucune mutation, aucun banking", () => {
      for (const role of [OrganizationRole.Reviewer, OrganizationRole.Executive]) {
        expect(ROLE_CANDIDATE_PERMISSIONS[role]).toEqual([CandidatePermission.Read]);
      }
    });

    it("aucun rôle en lecture seule ne peut muter l'identité candidate", () => {
      for (const role of [OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly]) {
        expect(roleHasCandidatePermission(role, CandidatePermission.ManageIdentity)).toBe(false);
      }
    });
  });

  /**
   * NON-RÉGRESSION LEGACY (mission CCV2-A "ne baisse aucune protection existante de
   * CompanyProfile") — le banking candidate ne doit jamais être plus permissif que le banking
   * legacy. Aujourd'hui `ClientPermission.ReadCompanyBanking` n'est accordé qu'au CLIENT_MANAGER,
   * jamais au CONTRIBUTOR ni au VIEWER. Ce test échouera si un futur checkpoint élargit l'un des
   * deux paliers sans l'autre.
   */
  describe("non-régression vis-à-vis du banking legacy", () => {
    it("le banking legacy reste réservé au CLIENT_MANAGER", () => {
      expect(ROLE_CLIENT_ACTION_PERMISSIONS[ClientRole.ClientManager]).toContain(ClientPermission.ReadCompanyBanking);
      expect(ROLE_CLIENT_ACTION_PERMISSIONS[ClientRole.Contributor]).not.toContain(ClientPermission.ReadCompanyBanking);
      expect(ROLE_CLIENT_ACTION_PERMISSIONS[ClientRole.Viewer]).not.toContain(ClientPermission.ReadCompanyBanking);
    });

    it("le banking candidate est accordé à strictement moins de rôles que la lecture candidate", () => {
      const readers = Object.values(OrganizationRole).filter((role) => roleHasCandidatePermission(role, CandidatePermission.Read));
      const bankingReaders = Object.values(OrganizationRole).filter((role) => roleHasCandidatePermission(role, CandidatePermission.ReadBanking));
      expect(bankingReaders.length).toBeLessThan(readers.length);
      for (const role of bankingReaders) {
        expect(readers).toContain(role);
      }
    });
  });

  it("assertHasCandidatePermission lève CandidatePermissionMissingError, jamais une erreur générique", () => {
    expect(() => assertHasCandidatePermission(OrganizationRole.ReadOnly, CandidatePermission.ReadBanking)).toThrow(CandidatePermissionMissingError);
    expect(() => assertHasCandidatePermission(OrganizationRole.Owner, CandidatePermission.ReadBanking)).not.toThrow();
  });
});
