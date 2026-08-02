import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../shared-kernel/id-generator";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ChecklistPieceEntry } from "../domain/checklist-piece-entry.aggregate";
import { ComplianceMatrixEntry } from "../domain/compliance-matrix-entry.aggregate";
import { Criticality } from "../domain/compliance-coverage-status";
import { Deliverable } from "../domain/deliverable.aggregate";
import { DeliverableAnnex } from "../domain/deliverable-annex.aggregate";
import { DeliverableExportSelection } from "../domain/deliverable-export-selection.entity";
import { DeliverableRevision } from "../domain/deliverable-revision.aggregate";
import { DeliverableRevisionSourceType } from "../domain/deliverable-revision-source-type";
import { DeliverableRevisionStatus } from "../domain/deliverable-revision-status";
import { DeliverableSection } from "../domain/deliverable-section.aggregate";
import { validateDeliverableTemplateSections } from "../domain/deliverable-template-section-config";
import { DeliverableTemplate } from "../domain/deliverable-template.aggregate";
import { DeliverableTemplateVersion } from "../domain/deliverable-template-version.entity";
import { DeliverableType } from "../domain/deliverable-type";
import { RevisionEditConflictError } from "../domain/errors";
import { ScopeLevel } from "../domain/scope-level";
import { TemplateSectionRequirement } from "../domain/template-section-requirement";
import { validateDocumentThemeConfig } from "../domain/document-theme-config";
import { DocumentTheme } from "../domain/document-theme.aggregate";
import { DocumentThemeVersion } from "../domain/document-theme-version.entity";
import { PrismaChecklistPieceEntryRepository } from "./prisma-checklist-piece-entry.repository";
import { PrismaComplianceMatrixEntryRepository } from "./prisma-compliance-matrix-entry.repository";
import { PrismaDeliverableRepository } from "./prisma-deliverable.repository";
import { PrismaDeliverableAnnexRepository } from "./prisma-deliverable-annex.repository";
import { PrismaDeliverableExportSelectionRepository } from "./prisma-deliverable-export-selection.repository";
import { PrismaDeliverableRevisionRepository } from "./prisma-deliverable-revision.repository";
import { PrismaDeliverableSectionRepository } from "./prisma-deliverable-section.repository";
import { PrismaDeliverableTemplateRepository } from "./prisma-deliverable-template.repository";
import { PrismaDocumentThemeRepository } from "./prisma-document-theme.repository";

/**
 * Preuve PostgreSQL réelle (mission Sprint 8A.1 §23/§24) — un fake en mémoire ne suffit pas à
 * démontrer que le verrou optimiste `editVersion` protège réellement contre une écriture
 * concurrente, ni que l'index partiel "une seule version ACTIVE" protège une activation
 * concurrente de template/thème, ni qu'un JSON structuré (contentStructured/allowedVariables/
 * config) survit un aller-retour réel.
 */
describe("Deliverables repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const idGenerator = new UuidGenerator();
  const deliverableRepository = new PrismaDeliverableRepository(prisma);
  const sectionRepository = new PrismaDeliverableSectionRepository(prisma);
  const revisionRepository = new PrismaDeliverableRevisionRepository(prisma);
  const exportSelectionRepository = new PrismaDeliverableExportSelectionRepository(prisma);
  const templateRepository = new PrismaDeliverableTemplateRepository(prisma, idGenerator);
  const themeRepository = new PrismaDocumentThemeRepository(prisma);
  const complianceRepository = new PrismaComplianceMatrixEntryRepository(prisma);
  const checklistRepository = new PrismaChecklistPieceEntryRepository(prisma);
  const annexRepository = new PrismaDeliverableAnnexRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-09-02T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Deliverables Repo Test Org", slug: `deliverables-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Deliverables Repo Test Org (other)", slug: `deliverables-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() },
    });
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() },
    });
  });

  afterAll(async () => {
    await prisma.deliverable.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.deliverableTemplate.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.documentTheme.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.deliverable.deleteMany({ where: { organizationId } });
    await prisma.deliverableTemplate.deleteMany({ where: { organizationId } });
    await prisma.documentTheme.deleteMany({ where: { organizationId } });
  });

  async function createDeliverableWithSection() {
    const deliverable = Deliverable.create({
      id: randomUUID(),
      organizationId,
      clientAccountId,
      tenderId,
      type: DeliverableType.TechnicalMemo,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await deliverableRepository.create(deliverable);

    const section = DeliverableSection.create({
      id: randomUUID(),
      organizationId,
      deliverableId: deliverable.id,
      code: "INTRO",
      title: "Introduction",
      order: 0,
      headingLevel: 1,
      mandatory: true,
      occurredAt: now,
    });
    await sectionRepository.createMany([section]);
    return { deliverable, section };
  }

  it("persists a Deliverable and its sections, reads them back with the same shape", async () => {
    const { deliverable, section } = await createDeliverableWithSection();

    const found = await deliverableRepository.findById({ organizationId, deliverableId: deliverable.id });
    expect(found?.type).toBe(DeliverableType.TechnicalMemo);
    expect(found?.status).toBe("NOT_STARTED");

    const sections = await sectionRepository.listByDeliverable({ organizationId, deliverableId: deliverable.id });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe(section.id);

    const byTenderAndType = await deliverableRepository.findByTenderAndType({ organizationId, tenderId, type: DeliverableType.TechnicalMemo });
    expect(byTenderAndType?.id).toBe(deliverable.id);
  });

  it("persists a revision with rich structured content (runs/table) and round-trips it exactly", async () => {
    const { section } = await createDeliverableWithSection();
    const content = [
      { kind: "paragraph", text: "Texte", runs: [{ text: "gras", bold: true }, { text: "lien", href: "https://example.org" }] },
      { kind: "table", headerRow: ["A", "B"], rows: [["1", "2"]] },
    ];
    const revision = DeliverableRevision.create({
      id: randomUUID(),
      organizationId,
      deliverableSectionId: section.id,
      revisionNumber: 1,
      sourceType: DeliverableRevisionSourceType.Manual,
      content,
      createdBy: randomUUID(),
      createdByRole: "BID_MANAGER",
      occurredAt: now,
    });
    await revisionRepository.create(revision);

    const found = await revisionRepository.findById({ organizationId, revisionId: revision.id });
    expect(found?.contentStructured).toEqual(content);
    expect(found?.characterCount).toBe(revision.characterCount);
  });

  it("saveWithOptimisticLock persists a real edit and rejects a stale editVersion with an explicit conflict (real Postgres, no silent overwrite)", async () => {
    const { section } = await createDeliverableWithSection();
    const revision = DeliverableRevision.create({
      id: randomUUID(),
      organizationId,
      deliverableSectionId: section.id,
      revisionNumber: 1,
      sourceType: DeliverableRevisionSourceType.Manual,
      content: [{ kind: "paragraph", text: "v0" }],
      createdBy: randomUUID(),
      createdByRole: "BID_MANAGER",
      occurredAt: now,
    });
    await revisionRepository.create(revision);

    // Éditeur A charge editVersion=0, sauvegarde avec succès.
    const forA = (await revisionRepository.findById({ organizationId, revisionId: revision.id }))!;
    forA.applyEdit({ content: [{ kind: "paragraph", text: "v1 (A)" }], expectedEditVersion: 0, occurredAt: now });
    await revisionRepository.saveWithOptimisticLock({ revision: forA, expectedEditVersion: 0 });

    // Éditeur B avait aussi chargé editVersion=0 — sa tentative de sauvegarde doit échouer
    // explicitement, jamais écraser silencieusement la sauvegarde de A.
    const forB = DeliverableRevision.rehydrate({
      id: revision.id,
      organizationId,
      deliverableSectionId: section.id,
      revisionNumber: 1,
      sourceType: DeliverableRevisionSourceType.Manual,
      contentStructured: [{ kind: "paragraph", text: "v0" }],
      contentText: "v0",
      characterCount: 2,
      status: DeliverableRevisionStatus.Draft,
      editVersion: 0,
      createdBy: revision.createdBy,
      createdByRole: "BID_MANAGER",
      createdAt: now,
      updatedAt: now,
    });
    forB.applyEdit({ content: [{ kind: "paragraph", text: "v1 (B, obsolète)" }], expectedEditVersion: 0, occurredAt: now });
    await expect(revisionRepository.saveWithOptimisticLock({ revision: forB, expectedEditVersion: 0 })).rejects.toThrow(RevisionEditConflictError);

    // Preuve finale : le contenu persisté est celui de A, jamais celui de B.
    const finalState = await revisionRepository.findById({ organizationId, revisionId: revision.id });
    expect(finalState?.contentText).toBe("v1 (A)");
    expect(finalState?.editVersion).toBe(1);
  });

  it("nextRevisionNumber increments per section, independent of other sections", async () => {
    const { section } = await createDeliverableWithSection();
    expect(await revisionRepository.nextRevisionNumber({ organizationId, deliverableSectionId: section.id })).toBe(1);
    const r1 = DeliverableRevision.create({
      id: randomUUID(),
      organizationId,
      deliverableSectionId: section.id,
      revisionNumber: 1,
      sourceType: DeliverableRevisionSourceType.Manual,
      content: [{ kind: "paragraph", text: "x" }],
      createdBy: randomUUID(),
      createdByRole: "BID_MANAGER",
      occurredAt: now,
    });
    await revisionRepository.create(r1);
    expect(await revisionRepository.nextRevisionNumber({ organizationId, deliverableSectionId: section.id })).toBe(2);
  });

  it("DeliverableExportSelection upsert replaces the previous selection for the same section (never accumulates)", async () => {
    const { section } = await createDeliverableWithSection();
    const r1 = DeliverableRevision.create({
      id: randomUUID(),
      organizationId,
      deliverableSectionId: section.id,
      revisionNumber: 1,
      sourceType: DeliverableRevisionSourceType.Manual,
      content: [{ kind: "paragraph", text: "v1" }],
      createdBy: randomUUID(),
      createdByRole: "BID_MANAGER",
      occurredAt: now,
    });
    r1.submitForReview(now);
    r1.validate(now);
    await revisionRepository.create(r1);

    const r2 = DeliverableRevision.create({
      id: randomUUID(),
      organizationId,
      deliverableSectionId: section.id,
      revisionNumber: 2,
      sourceType: DeliverableRevisionSourceType.Manual,
      content: [{ kind: "paragraph", text: "v2" }],
      createdBy: randomUUID(),
      createdByRole: "BID_MANAGER",
      occurredAt: now,
    });
    r2.submitForReview(now);
    r2.validate(now);
    await revisionRepository.create(r2);

    const selection1 = DeliverableExportSelection.create({ id: randomUUID(), organizationId, deliverableSectionId: section.id, revision: r1, selectedBy: randomUUID(), occurredAt: now });
    await exportSelectionRepository.upsert(selection1);
    expect((await exportSelectionRepository.findBySection({ organizationId, deliverableSectionId: section.id }))?.deliverableRevisionId).toBe(r1.id);

    const selection2 = DeliverableExportSelection.create({ id: randomUUID(), organizationId, deliverableSectionId: section.id, revision: r2, selectedBy: randomUUID(), occurredAt: now });
    await exportSelectionRepository.upsert(selection2);
    const found = await exportSelectionRepository.findBySection({ organizationId, deliverableSectionId: section.id });
    expect(found?.deliverableRevisionId).toBe(r2.id);

    const all = await prisma.deliverableExportSelection.count({ where: { organizationId, deliverableSectionId: section.id } });
    expect(all).toBe(1);
  });

  function buildTemplateAndVersion() {
    const templateId = randomUUID();
    const template = DeliverableTemplate.create({
      id: templateId,
      organizationId,
      scopeLevel: ScopeLevel.Organization,
      documentType: DeliverableType.TechnicalMemo,
      name: `Modèle ${randomUUID()}`,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const version = DeliverableTemplateVersion.create({
      id: randomUUID(),
      organizationId,
      deliverableTemplateId: templateId,
      version: 1,
      sections: validateDeliverableTemplateSections([
        { code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: TemplateSectionRequirement.Mandatory, allowedVariables: ["tenderTitle"] },
      ]),
      createdBy: randomUUID(),
      occurredAt: now,
    });
    return { template, version };
  }

  it("persists a DeliverableTemplate with its first DRAFT version and sections, reads it back with the same shape", async () => {
    const { template, version } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version });

    const found = await templateRepository.findById({ organizationId, deliverableTemplateId: template.id });
    expect(found?.activeVersion).toBeUndefined();

    const versions = await templateRepository.listVersions({ organizationId, deliverableTemplateId: template.id });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.sections[0]?.code).toBe("INTRO");
    expect(versions[0]?.sections[0]?.allowedVariables).toEqual(["tenderTitle"]);
  });

  it("DeliverableTemplateVersion: repeated concurrent activation attempts never leave two ACTIVE versions (partial unique index, real Postgres) — repeated ×3", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { template, version: v1 } = buildTemplateAndVersion();
      await templateRepository.createWithFirstVersion({ template, version: v1 });
      const v2 = DeliverableTemplateVersion.create({
        id: randomUUID(),
        organizationId,
        deliverableTemplateId: template.id,
        version: 2,
        sections: v1.sections,
        createdBy: randomUUID(),
        occurredAt: now,
      });
      await templateRepository.createVersion(v2);

      await Promise.allSettled([
        templateRepository.activateAtomically({ organizationId, deliverableTemplateId: template.id, versionId: v1.id, occurredAt: now }),
        templateRepository.activateAtomically({ organizationId, deliverableTemplateId: template.id, versionId: v2.id, occurredAt: now }),
      ]);

      const activeCount = await prisma.deliverableTemplateVersion.count({ where: { organizationId, deliverableTemplateId: template.id, status: "ACTIVE" } });
      expect(activeCount).toBe(1);
    }
  });

  it("findActiveVersionForScope resolves TENDER before CLIENT before ORGANIZATION", async () => {
    const org = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion(org);
    await templateRepository.activateAtomically({ organizationId, deliverableTemplateId: org.template.id, versionId: org.version.id, occurredAt: now });

    const tenderTemplate = DeliverableTemplate.create({
      id: randomUUID(),
      organizationId,
      scopeLevel: ScopeLevel.Tender,
      tenderId,
      documentType: DeliverableType.TechnicalMemo,
      name: `Modèle Tender ${randomUUID()}`,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const tenderVersion = DeliverableTemplateVersion.create({
      id: randomUUID(),
      organizationId,
      deliverableTemplateId: tenderTemplate.id,
      version: 1,
      sections: org.version.sections,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await templateRepository.createWithFirstVersion({ template: tenderTemplate, version: tenderVersion });
    await templateRepository.activateAtomically({ organizationId, deliverableTemplateId: tenderTemplate.id, versionId: tenderVersion.id, occurredAt: now });

    const resolved = await templateRepository.findActiveVersionForScope({ organizationId, scopeLevel: ScopeLevel.Tender, tenderId, documentType: DeliverableType.TechnicalMemo });
    expect(resolved?.template.id).toBe(tenderTemplate.id);

    const resolvedOrg = await templateRepository.findActiveVersionForScope({ organizationId, scopeLevel: ScopeLevel.Organization, documentType: DeliverableType.TechnicalMemo });
    expect(resolvedOrg?.template.id).toBe(org.template.id);
  });

  it("DocumentThemeVersion: repeated concurrent activation attempts never leave two ACTIVE versions — repeated ×3", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const themeId = randomUUID();
      const theme = DocumentTheme.create({ id: themeId, organizationId, scopeLevel: ScopeLevel.Organization, name: `Thème ${randomUUID()}`, createdBy: randomUUID(), occurredAt: now });
      const v1 = DocumentThemeVersion.create({
        id: randomUUID(),
        organizationId,
        documentThemeId: themeId,
        version: 1,
        config: validateDocumentThemeConfig({}),
        createdBy: randomUUID(),
        occurredAt: now,
      });
      await themeRepository.createWithFirstVersion({ theme, version: v1 });
      const v2 = DocumentThemeVersion.create({
        id: randomUUID(),
        organizationId,
        documentThemeId: themeId,
        version: 2,
        config: v1.config,
        createdBy: randomUUID(),
        occurredAt: now,
      });
      await themeRepository.createVersion(v2);

      await Promise.allSettled([
        themeRepository.activateAtomically({ organizationId, documentThemeId: themeId, versionId: v1.id, occurredAt: now }),
        themeRepository.activateAtomically({ organizationId, documentThemeId: themeId, versionId: v2.id, occurredAt: now }),
      ]);

      const activeCount = await prisma.documentThemeVersion.count({ where: { organizationId, documentThemeId: themeId, status: "ACTIVE" } });
      expect(activeCount).toBe(1);
    }
  });

  it("overlay entries (ComplianceMatrix/Checklist/Annex) round-trip through Postgres", async () => {
    const { deliverable } = await createDeliverableWithSection();

    const complianceEntry = ComplianceMatrixEntry.create({
      id: randomUUID(),
      organizationId,
      deliverableId: deliverable.id,
      source: "CCTP art. 3.2",
      mandatory: true,
      criticality: Criticality.High,
      order: 0,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await complianceRepository.create(complianceEntry);
    expect((await complianceRepository.listByDeliverable({ organizationId, deliverableId: deliverable.id }))[0]?.source).toBe("CCTP art. 3.2");

    const checklistEntry = ChecklistPieceEntry.create({
      id: randomUUID(),
      organizationId,
      deliverableId: deliverable.id,
      name: "Attestation fiscale",
      mandatory: true,
      order: 0,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await checklistRepository.create(checklistEntry);
    expect((await checklistRepository.listByDeliverable({ organizationId, deliverableId: deliverable.id }))[0]?.status).toBe("MISSING");

    const annex = DeliverableAnnex.create({
      id: randomUUID(),
      organizationId,
      deliverableId: deliverable.id,
      label: "CV chef de projet",
      order: 0,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await annexRepository.create(annex);
    expect((await annexRepository.listByDeliverable({ organizationId, deliverableId: deliverable.id }))[0]?.label).toBe("CV chef de projet");
  });

  it("tenant isolation — organization A cannot read organization B's deliverable or template", async () => {
    const { deliverable } = await createDeliverableWithSection();
    expect(await deliverableRepository.findById({ organizationId: otherOrganizationId, deliverableId: deliverable.id })).toBeNull();

    const { template, version } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version });
    expect(await templateRepository.findById({ organizationId: otherOrganizationId, deliverableTemplateId: template.id })).toBeNull();
  });
});
