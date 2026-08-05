import { describe, expect, it } from "vitest";
import { AdministrativeFormDraft } from "./administrative-form-draft.aggregate";
import { AdministrativeFormType } from "./administrative-form-type";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("AdministrativeFormDraft", () => {
  it("defaults scopeId to an empty string, never undefined — DB uniqueness relies on it", () => {
    const draft = AdministrativeFormDraft.create({
      id: "draft-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      documentType: AdministrativeFormType.Dc1,
      data: { signatoryName: "Jean Dupont" },
      updatedBy: "user-1",
      occurredAt: NOW,
    });

    expect(draft.scopeId).toBe("");
  });

  it("keeps a distinct scopeId for a scoped form (DC4 per subcontractor)", () => {
    const draft = AdministrativeFormDraft.create({
      id: "draft-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      documentType: AdministrativeFormType.Dc4,
      scopeId: "sub-1",
      data: {},
      updatedBy: "user-1",
      occurredAt: NOW,
    });

    expect(draft.scopeId).toBe("sub-1");
  });

  it("updateData replaces the blob and never touches any other aggregate", () => {
    const draft = AdministrativeFormDraft.create({
      id: "draft-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      documentType: AdministrativeFormType.Dc1,
      data: { signatoryName: "Jean Dupont" },
      updatedBy: "user-1",
      occurredAt: NOW,
    });

    draft.updateData({ data: { signatoryName: "Marie Martin" }, updatedBy: "user-2", occurredAt: NOW });

    expect(draft.data).toEqual({ signatoryName: "Marie Martin" });
    expect(draft.updatedBy).toBe("user-2");
  });
});
