import { describe, expect, it } from "vitest";
import { TemplateThemeResolverService } from "./template-theme-resolver.service";
import type { DeliverableTemplateRepository } from "../ports/deliverable-template.repository";
import type { DocumentThemeRepository } from "../ports/document-theme.repository";
import { DeliverableTemplate } from "../../domain/deliverable-template.aggregate";
import { DeliverableTemplateVersion } from "../../domain/deliverable-template-version.entity";
import { validateDeliverableTemplateSections } from "../../domain/deliverable-template-section-config";
import { DeliverableType } from "../../domain/deliverable-type";
import { validateDocumentThemeConfig } from "../../domain/document-theme-config";
import { DocumentTheme } from "../../domain/document-theme.aggregate";
import { DocumentThemeVersion } from "../../domain/document-theme-version.entity";
import { ScopeLevel } from "../../domain/scope-level";
import { TemplateSectionRequirement } from "../../domain/template-section-requirement";

const NOW = new Date("2026-09-01T10:00:00.000Z");
const SECTIONS = validateDeliverableTemplateSections([
  { code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: TemplateSectionRequirement.Mandatory, allowedVariables: [] },
]);

function templateAt(scopeLevel: ScopeLevel, extra: Partial<Parameters<typeof DeliverableTemplate.create>[0]> = {}) {
  const template = DeliverableTemplate.create({
    id: `tpl-${scopeLevel}`,
    organizationId: "org-1",
    scopeLevel,
    documentType: DeliverableType.TechnicalMemo,
    name: `Template ${scopeLevel}`,
    createdBy: "user-1",
    occurredAt: NOW,
    ...extra,
  });
  const version = DeliverableTemplateVersion.create({
    id: `tplv-${scopeLevel}`,
    organizationId: "org-1",
    deliverableTemplateId: template.id,
    version: 1,
    sections: SECTIONS,
    createdBy: "user-1",
    occurredAt: NOW,
  });
  version.activate(NOW);
  return { scopeLevel, template, version };
}

/** Fake minimal : seuls les paliers explicitement enregistrés répondent, les autres renvoient null
 *  (aucune donnée croisée involontaire entre paliers). */
function fakeTemplateRepository(entries: readonly { scopeLevel: ScopeLevel; template: DeliverableTemplate; version: DeliverableTemplateVersion }[]): DeliverableTemplateRepository {
  return {
    createWithFirstVersion: async () => undefined,
    findById: async () => null,
    list: async () => [],
    createVersion: async () => undefined,
    findVersionById: async () => null,
    listVersions: async () => [],
    activateAtomically: async () => {
      throw new Error("not used in this test");
    },
    findActiveVersionForScope: async (input) => {
      const match = entries.find((e) => e.scopeLevel === input.scopeLevel);
      return match ? { template: match.template, version: match.version } : null;
    },
  };
}

function emptyThemeRepository(): DocumentThemeRepository {
  return {
    createWithFirstVersion: async () => undefined,
    findById: async () => null,
    list: async () => [],
    createVersion: async () => undefined,
    findVersionById: async () => null,
    listVersions: async () => [],
    activateAtomically: async () => {
      throw new Error("not used in this test");
    },
    findActiveVersionForScope: async () => null,
  };
}

function themeAt(scopeLevel: ScopeLevel, extra: Partial<Parameters<typeof DocumentTheme.create>[0]> = {}) {
  const theme = DocumentTheme.create({ id: `theme-${scopeLevel}`, organizationId: "org-1", scopeLevel, name: `Theme ${scopeLevel}`, createdBy: "user-1", occurredAt: NOW, ...extra });
  const version = DocumentThemeVersion.create({
    id: `themev-${scopeLevel}`,
    organizationId: "org-1",
    documentThemeId: theme.id,
    version: 1,
    config: validateDocumentThemeConfig({}),
    createdBy: "user-1",
    occurredAt: NOW,
  });
  version.activate(NOW);
  return { scopeLevel, theme, version };
}

function fakeThemeRepository(entries: readonly { scopeLevel: ScopeLevel; theme: DocumentTheme; version: DocumentThemeVersion }[]): DocumentThemeRepository {
  return {
    createWithFirstVersion: async () => undefined,
    findById: async () => null,
    list: async () => [],
    createVersion: async () => undefined,
    findVersionById: async () => null,
    listVersions: async () => [],
    activateAtomically: async () => {
      throw new Error("not used in this test");
    },
    findActiveVersionForScope: async (input) => {
      const match = entries.find((e) => e.scopeLevel === input.scopeLevel);
      return match ? { theme: match.theme, version: match.version } : null;
    },
  };
}

function emptyTemplateRepository(): DeliverableTemplateRepository {
  return {
    createWithFirstVersion: async () => undefined,
    findById: async () => null,
    list: async () => [],
    createVersion: async () => undefined,
    findVersionById: async () => null,
    listVersions: async () => [],
    activateAtomically: async () => {
      throw new Error("not used in this test");
    },
    findActiveVersionForScope: async () => null,
  };
}

describe("TemplateThemeResolverService.resolveTemplate (mission §5)", () => {
  it("prefers TENDER over CLIENT and ORGANIZATION when all three have an active version", async () => {
    const tender = templateAt(ScopeLevel.Tender, { tenderId: "tender-1" });
    const client = templateAt(ScopeLevel.Client, { clientAccountId: "client-1" });
    const org = templateAt(ScopeLevel.Organization);
    const service = new TemplateThemeResolverService(fakeTemplateRepository([tender, client, org]), emptyThemeRepository());

    const resolved = await service.resolveTemplate({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", documentType: DeliverableType.TechnicalMemo });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.Tender);
    expect(resolved?.template.id).toBe(tender.template.id);
  });

  it("falls back to CLIENT when no TENDER-level template is active", async () => {
    const client = templateAt(ScopeLevel.Client, { clientAccountId: "client-1" });
    const org = templateAt(ScopeLevel.Organization);
    const service = new TemplateThemeResolverService(fakeTemplateRepository([client, org]), emptyThemeRepository());

    const resolved = await service.resolveTemplate({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", documentType: DeliverableType.TechnicalMemo });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.Client);
  });

  it("falls back to ORGANIZATION when neither TENDER nor CLIENT has an active version", async () => {
    const org = templateAt(ScopeLevel.Organization);
    const service = new TemplateThemeResolverService(fakeTemplateRepository([org]), emptyThemeRepository());

    const resolved = await service.resolveTemplate({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", documentType: DeliverableType.TechnicalMemo });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.Organization);
  });

  it("falls back to TENDEROS (audit Codex P1-004) when neither TENDER, CLIENT nor ORGANIZATION has an active version", async () => {
    const system = templateAt(ScopeLevel.TenderOS);
    const service = new TemplateThemeResolverService(fakeTemplateRepository([system]), emptyThemeRepository());

    const resolved = await service.resolveTemplate({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", documentType: DeliverableType.TechnicalMemo });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.TenderOS);
    expect(resolved?.template.id).toBe(system.template.id);
  });

  it("ORGANIZATION still wins over TENDEROS when both have an active version", async () => {
    const org = templateAt(ScopeLevel.Organization);
    const system = templateAt(ScopeLevel.TenderOS);
    const service = new TemplateThemeResolverService(fakeTemplateRepository([org, system]), emptyThemeRepository());

    const resolved = await service.resolveTemplate({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", documentType: DeliverableType.TechnicalMemo });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.Organization);
  });

  it("returns null when no level has an active template — never a silent inconsistent merge", async () => {
    const service = new TemplateThemeResolverService(fakeTemplateRepository([]), emptyThemeRepository());

    const resolved = await service.resolveTemplate({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", documentType: DeliverableType.TechnicalMemo });

    expect(resolved).toBeNull();
  });
});

describe("TemplateThemeResolverService.resolveTheme (mission §6, correctif audit Codex P1-004)", () => {
  it("falls back to TENDEROS when no theme is active at any tenant-owned level", async () => {
    const system = themeAt(ScopeLevel.TenderOS);
    const service = new TemplateThemeResolverService(emptyTemplateRepository(), fakeThemeRepository([system]));

    const resolved = await service.resolveTheme({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1" });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.TenderOS);
    expect(resolved?.theme.id).toBe(system.theme.id);
  });

  it("ORGANIZATION still wins over TENDEROS when both have an active version", async () => {
    const org = themeAt(ScopeLevel.Organization);
    const system = themeAt(ScopeLevel.TenderOS);
    const service = new TemplateThemeResolverService(emptyTemplateRepository(), fakeThemeRepository([org, system]));

    const resolved = await service.resolveTheme({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1" });

    expect(resolved?.sourceLevel).toBe(ScopeLevel.Organization);
  });

  it("returns null when no level (including TENDEROS) has an active theme", async () => {
    const service = new TemplateThemeResolverService(emptyTemplateRepository(), fakeThemeRepository([]));

    const resolved = await service.resolveTheme({ organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1" });

    expect(resolved).toBeNull();
  });
});
