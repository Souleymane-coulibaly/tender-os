import { describe, expect, it } from "vitest";
import { canManageDocumentLifecycle, canUploadOrEditDocument, formatFileSize } from "./documents-types";

describe("canUploadOrEditDocument", () => {
  it("allows the admin tier", () => {
    expect(canUploadOrEditDocument("ORGANIZATION_ADMIN")).toBe(true);
    expect(canUploadOrEditDocument("BID_MANAGER")).toBe(true);
  });

  // Mission Sprint 8A.2 (audit Cockpit Bid Manager) — régression : OWNER manquait du miroir
  // ADMIN_TIER (jamais mis à jour après le correctif backend OWNER de document-permission.ts),
  // masquant l'import/édition de documents pour un propriétaire d'organisation.
  it("allows OWNER (superset of ORGANIZATION_ADMIN, backend-mirrored)", () => {
    expect(canUploadOrEditDocument("OWNER")).toBe(true);
  });

  it("allows the contributor tier", () => {
    expect(canUploadOrEditDocument("CONTRIBUTOR")).toBe(true);
  });

  it("rejects viewer-tier roles and an undefined role", () => {
    expect(canUploadOrEditDocument("READ_ONLY")).toBe(false);
    expect(canUploadOrEditDocument("REVIEWER")).toBe(false);
    expect(canUploadOrEditDocument(undefined)).toBe(false);
  });
});

describe("canManageDocumentLifecycle", () => {
  it("allows only the admin tier", () => {
    expect(canManageDocumentLifecycle("OWNER")).toBe(true);
    expect(canManageDocumentLifecycle("ORGANIZATION_ADMIN")).toBe(true);
    expect(canManageDocumentLifecycle("BID_MANAGER")).toBe(true);
    expect(canManageDocumentLifecycle("CONTRIBUTOR")).toBe(false);
    expect(canManageDocumentLifecycle("READ_ONLY")).toBe(false);
    expect(canManageDocumentLifecycle(undefined)).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatFileSize(500)).toBe("500 o");
    expect(formatFileSize(2048)).toBe("2.0 Ko");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 Mo");
  });
});
