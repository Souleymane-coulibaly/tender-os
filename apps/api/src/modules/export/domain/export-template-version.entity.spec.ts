import { describe, expect, it } from "vitest";
import { ExportTemplateVersion } from "./export-template-version.entity";
import { validateExportTemplateConfig } from "./export-template-config";
import { ExportFormat } from "./export-format";
import { ExportTemplateVersionStatus } from "./export-template-version-status";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function validConfig() {
  return validateExportTemplateConfig({ sections: [{ id: "SUMMARY", label: "Résumé", mandatory: true, order: 0 }] });
}

describe("ExportTemplateVersion", () => {
  it("is created DRAFT, never active by default", () => {
    const version = ExportTemplateVersion.create({
      id: "v1",
      organizationId: "org-1",
      exportTemplateId: "tpl-1",
      version: 1,
      format: ExportFormat.Docx,
      config: validConfig(),
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(version.status).toBe(ExportTemplateVersionStatus.Draft);
  });

  it("DRAFT -> ACTIVE -> ARCHIVED is allowed, in that order only", () => {
    const version = ExportTemplateVersion.create({
      id: "v1",
      organizationId: "org-1",
      exportTemplateId: "tpl-1",
      version: 1,
      format: ExportFormat.Docx,
      config: validConfig(),
      createdBy: "user-1",
      occurredAt: NOW,
    });
    version.activate(NOW);
    expect(version.status).toBe(ExportTemplateVersionStatus.Active);
    expect(version.activatedAt).toEqual(NOW);
    version.archive(NOW);
    expect(version.status).toBe(ExportTemplateVersionStatus.Archived);
  });

  it("rejects ARCHIVED -> ACTIVE (no way back)", () => {
    const version = ExportTemplateVersion.create({
      id: "v1",
      organizationId: "org-1",
      exportTemplateId: "tpl-1",
      version: 1,
      format: ExportFormat.Docx,
      config: validConfig(),
      createdBy: "user-1",
      occurredAt: NOW,
    });
    version.activate(NOW);
    version.archive(NOW);
    expect(() => version.activate(NOW)).toThrow();
  });

  it("rejects DRAFT -> ARCHIVED directly (must go through ACTIVE)", () => {
    const version = ExportTemplateVersion.create({
      id: "v1",
      organizationId: "org-1",
      exportTemplateId: "tpl-1",
      version: 1,
      format: ExportFormat.Docx,
      config: validConfig(),
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(() => version.archive(NOW)).toThrow();
  });
});

describe("validateExportTemplateConfig", () => {
  it("rejects an empty sections array", () => {
    expect(() => validateExportTemplateConfig({ sections: [] })).toThrow();
  });

  it("rejects duplicate section ids", () => {
    expect(() =>
      validateExportTemplateConfig({
        sections: [
          { id: "A", label: "A", mandatory: true, order: 0 },
          { id: "A", label: "A bis", mandatory: false, order: 1 },
        ],
      }),
    ).toThrow();
  });

  it("rejects a lowercase or malformed section id (no injection surface)", () => {
    expect(() => validateExportTemplateConfig({ sections: [{ id: "not valid!", label: "x", mandatory: true, order: 0 }] })).toThrow();
  });

  it("accepts a minimal valid config and applies safe defaults", () => {
    const config = validConfig();
    expect(config.sections).toHaveLength(1);
    expect(config.coverPage.showTitle).toBe(true);
    expect(config.showTableOfContents).toBe(true);
  });
});
