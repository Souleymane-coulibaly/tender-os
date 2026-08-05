import { describe, expect, it } from "vitest";
import { BuyerProvidedFormTemplate } from "./buyer-provided-form-template.aggregate";
import { AdministrativeFormType } from "./administrative-form-type";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("BuyerProvidedFormTemplate", () => {
  it("redesignate replaces the referenced document explicitly — never a silent merge", () => {
    const template = BuyerProvidedFormTemplate.create({
      id: "buyer-template-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      documentType: AdministrativeFormType.Dc1,
      documentId: "doc-1",
      documentVersionId: "docversion-1",
      designatedBy: "user-1",
      occurredAt: NOW,
    });

    const later = new Date("2026-09-11T10:00:00.000Z");
    template.redesignate({ documentId: "doc-2", documentVersionId: "docversion-2", designatedBy: "user-2", occurredAt: later });

    expect(template.documentId).toBe("doc-2");
    expect(template.designatedBy).toBe("user-2");
    expect(template.designatedAt).toEqual(later);
  });
});
