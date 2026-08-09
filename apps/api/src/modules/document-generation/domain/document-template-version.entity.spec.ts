import { describe, expect, it } from "vitest";
import { DocumentTemplateVersion } from "./document-template-version.entity";
import { DocumentTemplateVersionStatus } from "./document-template-version-status";
import { InvalidDocumentTemplateVersionStatusTransitionError } from "./errors";

function buildVersion(overrides?: { allowPartialGeneration?: boolean }) {
  return DocumentTemplateVersion.create({
    id: "version-1",
    organizationId: "org-1",
    documentTemplateId: "template-1",
    version: 1,
    sourceDocumentId: "doc-1",
    sourceDocumentVersionId: "doc-version-1",
    sourceChecksum: "checksum-1",
    discoveredPlaceholders: [{ fieldKey: "tender.reference", occurrences: 1 }],
    allowPartialGeneration: overrides?.allowPartialGeneration ?? false,
    fieldMappings: [
      { fieldKey: "tender.reference", label: "Référence", fieldType: "STRING", required: true },
      { fieldKey: "tender.description", label: "Description", fieldType: "MULTILINE", required: false },
    ],
    createdBy: "user-1",
    occurredAt: new Date("2026-08-01T00:00:00Z"),
  });
}

describe("DocumentTemplateVersion", () => {
  it("is created DRAFT — never active by default", () => {
    expect(buildVersion().status).toBe(DocumentTemplateVersionStatus.Draft);
  });

  it("transitions DRAFT -> ACTIVE -> ARCHIVED", () => {
    const version = buildVersion();
    version.activate(new Date("2026-08-02T00:00:00Z"));
    expect(version.status).toBe(DocumentTemplateVersionStatus.Active);
    expect(version.activatedAt).toEqual(new Date("2026-08-02T00:00:00Z"));

    version.archive(new Date("2026-08-03T00:00:00Z"));
    expect(version.status).toBe(DocumentTemplateVersionStatus.Archived);
  });

  it("BLOCKING — never allows ARCHIVED -> ACTIVE (no going back)", () => {
    const version = buildVersion();
    version.activate(new Date());
    version.archive(new Date());
    expect(() => version.activate(new Date())).toThrow(InvalidDocumentTemplateVersionStatusTransitionError);
  });

  it("computeMissingRequiredFields — a required field absent from the provided keys is reported", () => {
    const version = buildVersion();
    expect(version.computeMissingRequiredFields(new Set())).toEqual(["tender.reference"]);
  });

  it("computeMissingRequiredFields — never reports an optional field as missing", () => {
    const version = buildVersion();
    const missing = version.computeMissingRequiredFields(new Set(["tender.reference"]));
    expect(missing).toEqual([]);
  });

  it("computeMissingRequiredFields — empty when every required field is provided", () => {
    const version = buildVersion();
    expect(version.computeMissingRequiredFields(new Set(["tender.reference", "tender.description"]))).toEqual([]);
  });
});
