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
