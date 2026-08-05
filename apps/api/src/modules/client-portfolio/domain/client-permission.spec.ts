import { describe, expect, it } from "vitest";
import { ClientPermission, clientRoleHasActionPermission, roleHasClientPortfolioPermission } from "./client-permission";
import { ClientRole } from "./client-role";

describe("roleHasClientPortfolioPermission (organization-tier)", () => {
  it("grants OWNER and ORGANIZATION_ADMIN every portfolio capability", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      for (const permission of Object.values(ClientPermission)) {
        expect(roleHasClientPortfolioPermission(role, permission)).toBe(true);
      }
    }
  });

  it("never grants portfolio-level capabilities to any other organization role", () => {
    for (const role of ["BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasClientPortfolioPermission(role, ClientPermission.Create)).toBe(false);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ViewAll)).toBe(false);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.Delete)).toBe(false);
    }
  });

  it("grants an unknown role absolutely nothing", () => {
    expect(roleHasClientPortfolioPermission("SOME_UNKNOWN_ROLE", ClientPermission.Read)).toBe(false);
  });
});

describe("clientRoleHasActionPermission (client-tier, for actors reached via an assignment)", () => {
  it("CLIENT_MANAGER can read/update the client, manage assignments, and manage its knowledge", () => {
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.Read)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.Update)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.AssignUser)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.RemoveUser)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ManageKnowledge)).toBe(true);
  });

  it("CONTRIBUTOR can create/update tenders and manage knowledge, but never manage the client or its assignments", () => {
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.CreateTender)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ManageKnowledge)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.Update)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.AssignUser)).toBe(false);
  });

  it("VIEWER can only read — never mutate, never assign, never archive", () => {
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.Read)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ReadTender)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ReadDocuments)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ReadAnalysis)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ReadKnowledge)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.CreateTender)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.UpdateTender)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ManageKnowledge)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.AssignUser)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.Archive)).toBe(false);
  });

  it("an unknown client role receives no right at all", () => {
    for (const permission of Object.values(ClientPermission)) {
      expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", permission)).toBe(false);
    }
  });
});

/**
 * Mission Sprint 8A.1 §17 — matrice de permissions Livrables : CLIENT_MANAGER peut consulter/
 * éditer/générer ET valider (même palier qu'`ApproveExport`, "règle stricte") ; CONTRIBUTOR peut
 * consulter/éditer/générer mais jamais valider ; VIEWER peut uniquement consulter. OWNER/
 * ORGANIZATION_ADMIN (palier organisation) ont TOUJOURS accès via `roleHasClientPortfolioPermission`
 * — testé séparément ci-dessus, jamais via ce tableau par rôle client.
 */
describe("Deliverables permission matrix (mission Sprint 8A.1 §17)", () => {
  it("CLIENT_MANAGER can read, manage (edit/generate), AND validate a deliverable", () => {
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ReadDeliverable)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ManageDeliverable)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ValidateDeliverable)).toBe(true);
  });

  it("CONTRIBUTOR can read and manage (edit/generate) a deliverable, but never validate it", () => {
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ReadDeliverable)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ManageDeliverable)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ValidateDeliverable)).toBe(false);
  });

  it("VIEWER can only read a deliverable — never edit, generate, or validate", () => {
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ReadDeliverable)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ManageDeliverable)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ValidateDeliverable)).toBe(false);
  });

  it("an unassigned member (no client role at all) has no Deliverable capability", () => {
    expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", ClientPermission.ReadDeliverable)).toBe(false);
    expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", ClientPermission.ManageDeliverable)).toBe(false);
    expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", ClientPermission.ValidateDeliverable)).toBe(false);
  });

  it("OWNER/ORGANIZATION_ADMIN always have every Deliverable capability at the portfolio tier", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ReadDeliverable)).toBe(true);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ManageDeliverable)).toBe(true);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ValidateDeliverable)).toBe(true);
    }
  });
});

/**
 * Mission Sprint 9 §20 — matrice de permissions Dépôt : CLIENT_MANAGER a tout, y compris le retrait
 * ("règle stricte") ; CONTRIBUTOR peut consulter/préparer/enregistrer/ajouter une preuve/remplacer/
 * rejeter ET confirmer un reçu, mais jamais retirer ; VIEWER peut uniquement consulter.
 */
describe("Submission permission matrix (mission Sprint 9 §20)", () => {
  it("CLIENT_MANAGER can read, manage, confirm, AND withdraw a submission", () => {
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ReadSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ManageSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.ConfirmSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.ClientManager, ClientPermission.WithdrawSubmission)).toBe(true);
  });

  it("CONTRIBUTOR can read/manage/confirm a submission, but never withdraw it", () => {
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ReadSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ManageSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.ConfirmSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Contributor, ClientPermission.WithdrawSubmission)).toBe(false);
  });

  it("VIEWER can only read a submission — never manage, confirm, or withdraw", () => {
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ReadSubmission)).toBe(true);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ManageSubmission)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.ConfirmSubmission)).toBe(false);
    expect(clientRoleHasActionPermission(ClientRole.Viewer, ClientPermission.WithdrawSubmission)).toBe(false);
  });

  it("an unassigned member (no client role at all) has no Submission capability", () => {
    expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", ClientPermission.ReadSubmission)).toBe(false);
    expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", ClientPermission.ManageSubmission)).toBe(false);
    expect(clientRoleHasActionPermission("SOME_UNKNOWN_CLIENT_ROLE", ClientPermission.WithdrawSubmission)).toBe(false);
  });

  it("OWNER/ORGANIZATION_ADMIN always have every Submission capability at the portfolio tier", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ReadSubmission)).toBe(true);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ManageSubmission)).toBe(true);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.ConfirmSubmission)).toBe(true);
      expect(roleHasClientPortfolioPermission(role, ClientPermission.WithdrawSubmission)).toBe(true);
    }
  });
});
