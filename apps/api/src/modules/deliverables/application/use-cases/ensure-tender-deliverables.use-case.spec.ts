import { describe, expect, it, vi } from "vitest";
import { EnsureTenderDeliverablesUseCase } from "./ensure-tender-deliverables.use-case";
import type { DeliverableRepository } from "../ports/deliverable.repository";
import type { DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";
import { ScopeLevel } from "../../domain/scope-level";
import type { GetTenderUseCase } from "../../../tenders";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import type { TemplateThemeResolverService } from "../services/template-theme-resolver.service";
import { validateDeliverableTemplateSections } from "../../domain/deliverable-template-section-config";
import { TemplateSectionRequirement } from "../../domain/template-section-requirement";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `id-${(n += 1)}` };
}

function inMemoryDeliverableRepository(): DeliverableRepository {
  const rows = new Map<string, Deliverable>();
  return {
    create: async (d) => {
      rows.set(d.id, d);
    },
    findById: async ({ deliverableId }) => rows.get(deliverableId) ?? null,
    findByTenderAndType: async ({ tenderId, type }) => [...rows.values()].find((d) => d.tenderId === tenderId && d.type === type) ?? null,
    listByTender: async ({ tenderId }) => [...rows.values()].filter((d) => d.tenderId === tenderId),
    save: async (d) => {
      rows.set(d.id, d);
    },
  };
}

function inMemorySectionRepository(): DeliverableSectionRepository {
  const rows: { id: string; deliverableId: string }[] = [];
  return {
    createMany: async (sections: readonly { id: string; deliverableId: string }[]) => {
      for (const s of sections) rows.push({ id: s.id, deliverableId: s.deliverableId });
    },
    findById: async () => null,
    listByDeliverable: async () => [],
    save: async () => undefined,
  } as unknown as DeliverableSectionRepository;
}

describe("EnsureTenderDeliverablesUseCase (mission §3/§16)", () => {
  it("creates all 9 deliverable types on first call, is idempotent on the second call", async () => {
    const deliverableRepository = inMemoryDeliverableRepository();
    const sectionRepository = inMemorySectionRepository();
    const getTenderUseCase = { execute: vi.fn(async () => ({ clientAccountId: "client-1", title: "Tender", buyerName: "Acheteur", reference: "REF-1" })) } as unknown as GetTenderUseCase;
    const assertClientAccessUseCase = { execute: vi.fn(async () => undefined) } as unknown as AssertClientAccessUseCase;
    const templateThemeResolver = { resolveTemplate: vi.fn(async () => null), resolveTheme: vi.fn(async () => null) } as unknown as TemplateThemeResolverService;

    const useCase = new EnsureTenderDeliverablesUseCase(
      deliverableRepository,
      sectionRepository,
      getTenderUseCase,
      assertClientAccessUseCase,
      templateThemeResolver,
      fakeClock(),
      fakeIdGenerator(),
    );

    const first = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(first).toHaveLength(Object.values(DeliverableType).length);
    expect(new Set(first.map((d) => d.type)).size).toBe(Object.values(DeliverableType).length);

    const second = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(second.map((d) => d.id).sort()).toEqual(first.map((d) => d.id).sort());
  });

  it("materializes sections from the resolved template for structured deliverable types, recording sourceLevel", async () => {
    const deliverableRepository = inMemoryDeliverableRepository();
    const createdSections: unknown[] = [];
    const sectionRepository: DeliverableSectionRepository = {
      createMany: async (sections) => {
        createdSections.push(...sections);
      },
      findById: async () => null,
      listByDeliverable: async () => [],
      save: async () => undefined,
    };
    const getTenderUseCase = { execute: vi.fn(async () => ({ clientAccountId: "client-1", title: "Tender", buyerName: "Acheteur", reference: "REF-1" })) } as unknown as GetTenderUseCase;
    const assertClientAccessUseCase = { execute: vi.fn(async () => undefined) } as unknown as AssertClientAccessUseCase;

    const sections = validateDeliverableTemplateSections([
      { code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: TemplateSectionRequirement.Mandatory, allowedVariables: [] },
      { code: "METHODO", title: "Méthodologie", order: 1, headingLevel: 1, requirement: TemplateSectionRequirement.Optional, allowedVariables: [] },
    ]);
    const templateThemeResolver = {
      resolveTemplate: vi.fn(async () => ({
        template: { id: "tpl-1" },
        version: { id: "tplv-1", sections },
        sourceLevel: ScopeLevel.Organization,
      })),
      resolveTheme: vi.fn(async () => null),
    } as unknown as TemplateThemeResolverService;

    const useCase = new EnsureTenderDeliverablesUseCase(
      deliverableRepository,
      sectionRepository,
      getTenderUseCase,
      assertClientAccessUseCase,
      templateThemeResolver,
      fakeClock(),
      fakeIdGenerator(),
    );

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    const memo = result.find((d) => d.type === DeliverableType.TechnicalMemo)!;
    expect(memo.templateVersionId).toBe("tplv-1");
    expect(memo.templateSourceLevel).toBe(ScopeLevel.Organization);
    // 2 sections × 2 structured types (TECHNICAL_MEMO + EXECUTIVE_SUMMARY)
    expect(createdSections).toHaveLength(4);
  });
});
