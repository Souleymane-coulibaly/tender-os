import { describe, expect, it } from "vitest";
import { roleHasTenderPermission, TenderPermission } from "./tender-permission";

describe("roleHasTenderPermission", () => {
  it("grants Organization Admin and Bid Manager every Tenders permission", () => {
    for (const permission of Object.values(TenderPermission)) {
      expect(roleHasTenderPermission("ORGANIZATION_ADMIN", permission)).toBe(true);
      expect(roleHasTenderPermission("BID_MANAGER", permission)).toBe(true);
    }
  });

  /** Correction réaudit Codex Sprint 4.1 (P1-01-R) — OWNER était absent de
   *  ROLE_TENDER_PERMISSIONS, ce qui bloquait indirectement StartTenderAnalysisUseCase/
   *  StartDocumentAnalysisUseCase (via GetTenderUseCase, qui exige TenderPermission.Read) pour un
   *  propriétaire d'organisation, malgré une matrice Analysis elle-même correcte. */
  it("grants OWNER the same full permission set as ORGANIZATION_ADMIN, including tender:read", () => {
    for (const permission of Object.values(TenderPermission)) {
      expect(roleHasTenderPermission("OWNER", permission)).toBe(true);
    }
  });

  it("limits Contributor to read, list, and checklist management", () => {
    expect(roleHasTenderPermission("CONTRIBUTOR", TenderPermission.Read)).toBe(true);
    expect(roleHasTenderPermission("CONTRIBUTOR", TenderPermission.ManageChecklist)).toBe(true);
    expect(roleHasTenderPermission("CONTRIBUTOR", TenderPermission.Create)).toBe(false);
    expect(roleHasTenderPermission("CONTRIBUTOR", TenderPermission.ManageRisks)).toBe(false);
  });

  it("limits Read Only to read and list", () => {
    expect(roleHasTenderPermission("READ_ONLY", TenderPermission.Read)).toBe(true);
    expect(roleHasTenderPermission("READ_ONLY", TenderPermission.List)).toBe(true);
    expect(roleHasTenderPermission("READ_ONLY", TenderPermission.Update)).toBe(false);
    expect(roleHasTenderPermission("READ_ONLY", TenderPermission.Archive)).toBe(false);
  });

  it("denies every permission for an unknown or missing role", () => {
    for (const permission of Object.values(TenderPermission)) {
      expect(roleHasTenderPermission("SOME_UNKNOWN_ROLE", permission)).toBe(false);
    }
  });
});
