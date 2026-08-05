import { describe, expect, it } from "vitest";
import { OfficialAdministrativeTemplate } from "./official-administrative-template.aggregate";
import { AdministrativeFormType } from "./administrative-form-type";

const NOW = new Date("2026-09-10T10:00:00.000Z");

describe("OfficialAdministrativeTemplate", () => {
  it("is created active, with the original file referenced never copied", () => {
    const template = OfficialAdministrativeTemplate.create({
      id: "template-1",
      documentType: AdministrativeFormType.Dc4,
      officialName: "DC4 — Déclaration de sous-traitance",
      version: 1,
      sourceAuthority: "DAJ",
      sourceReference: "https://www.economie.gouv.fr/files/.../DC4_2023_Duree_contrat_sous_traitance.docx",
      fileDocumentId: "doc-1",
      fileDocumentVersionId: "docversion-1",
      hash: "abc123",
      createdBy: "user-1",
      occurredAt: NOW,
    });

    expect(template.active).toBe(true);
    expect(template.fileDocumentId).toBe("doc-1");
    expect(template.organizationId).toBeUndefined();
  });

  it("deactivates without touching the referenced file — never a silent content replacement", () => {
    const template = OfficialAdministrativeTemplate.create({
      id: "template-1",
      documentType: AdministrativeFormType.Dc1,
      officialName: "DC1",
      version: 1,
      sourceAuthority: "DAJ",
      sourceReference: "https://www.economie.gouv.fr/files/.../DC1-2019.doc",
      fileDocumentId: "doc-1",
      fileDocumentVersionId: "docversion-1",
      hash: "abc123",
      createdBy: "user-1",
      occurredAt: NOW,
    });

    template.deactivate(NOW);

    expect(template.active).toBe(false);
    expect(template.fileDocumentId).toBe("doc-1");
  });
});
