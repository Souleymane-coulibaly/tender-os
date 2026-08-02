import { describe, expect, it } from "vitest";
import { DeliverableTemplate } from "./deliverable-template.aggregate";
import { DeliverableTemplateVersion } from "./deliverable-template-version.entity";
import { validateDeliverableTemplateSections } from "./deliverable-template-section-config";
import { ScopeLevel } from "./scope-level";
import { DeliverableType } from "./deliverable-type";
import { VersionLifecycleStatus } from "./version-lifecycle-status";
import { TemplateSectionRequirement } from "./template-section-requirement";

const NOW = new Date("2026-09-01T10:00:00.000Z");

describe("DeliverableTemplate scope invariants (mission §5)", () => {
  it("requires tenderId for a TENDER-scoped template", () => {
    expect(() =>
      DeliverableTemplate.create({
        id: "t-1",
        organizationId: "org-1",
        scopeLevel: ScopeLevel.Tender,
        documentType: DeliverableType.TechnicalMemo,
        name: "Imposé par l'acheteur",
        createdBy: "user-1",
        occurredAt: NOW,
      }),
    ).toThrow();
  });

  it("requires clientAccountId for a CLIENT-scoped template", () => {
    expect(() =>
      DeliverableTemplate.create({
        id: "t-1",
        organizationId: "org-1",
        scopeLevel: ScopeLevel.Client,
        documentType: DeliverableType.TechnicalMemo,
        name: "Client",
        createdBy: "user-1",
        occurredAt: NOW,
      }),
    ).toThrow();
  });

  it("refuses tenderId/clientAccountId on an ORGANIZATION-scoped template", () => {
    expect(() =>
      DeliverableTemplate.create({
        id: "t-1",
        organizationId: "org-1",
        scopeLevel: ScopeLevel.Organization,
        tenderId: "tender-1",
        documentType: DeliverableType.TechnicalMemo,
        name: "Système",
        createdBy: "user-1",
        occurredAt: NOW,
      }),
    ).toThrow();
  });

  it("accepts a well-formed ORGANIZATION-scoped template", () => {
    const template = DeliverableTemplate.create({
      id: "t-1",
      organizationId: "org-1",
      scopeLevel: ScopeLevel.Organization,
      documentType: DeliverableType.TechnicalMemo,
      name: "Modèle standard TenderOS",
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(template.scopeLevel).toBe(ScopeLevel.Organization);
  });
});

describe("validateDeliverableTemplateSections (mission §5)", () => {
  it("rejects duplicate section codes", () => {
    expect(() =>
      validateDeliverableTemplateSections([
        { code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: TemplateSectionRequirement.Mandatory, allowedVariables: [] },
        { code: "INTRO", title: "Doublon", order: 1, headingLevel: 1, requirement: TemplateSectionRequirement.Mandatory, allowedVariables: [] },
      ]),
    ).toThrow();
  });

  it("accepts a well-formed section list with the mission's rich per-section fields", () => {
    const sections = validateDeliverableTemplateSections([
      {
        code: "METHODOLOGIE",
        title: "Méthodologie",
        description: "Décrit l'approche",
        order: 0,
        headingLevel: 1,
        requirement: TemplateSectionRequirement.Mandatory,
        recommendedLength: 500,
        maxCharacters: 3000,
        instructions: "Décrire la méthodologie projet",
        taskType: "METHODOLOGY_SECTION",
        allowedVariables: ["tenderTitle"],
        validationRequired: true,
        pageBreakBefore: false,
      },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.taskType).toBe("METHODOLOGY_SECTION");
  });
});

describe("DeliverableTemplateVersion lifecycle (mission §5)", () => {
  const sections = validateDeliverableTemplateSections([
    { code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: TemplateSectionRequirement.Mandatory, allowedVariables: [] },
  ]);

  it("is created DRAFT and follows DRAFT -> ACTIVE -> ARCHIVED, never backwards", () => {
    const version = DeliverableTemplateVersion.create({ id: "v-1", organizationId: "org-1", deliverableTemplateId: "t-1", version: 1, sections, createdBy: "user-1", occurredAt: NOW });
    expect(version.status).toBe(VersionLifecycleStatus.Draft);
    version.activate(NOW);
    expect(version.status).toBe(VersionLifecycleStatus.Active);
    version.archive(NOW);
    expect(version.status).toBe(VersionLifecycleStatus.Archived);
    expect(() => version.activate(NOW)).toThrow();
  });
});
