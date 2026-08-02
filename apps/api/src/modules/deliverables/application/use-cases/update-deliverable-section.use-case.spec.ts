import { describe, expect, it, vi } from "vitest";
import { UpdateDeliverableSectionUseCase } from "./update-deliverable-section.use-case";
import type { DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import type { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";

function fakeSection(overrides: Partial<Parameters<typeof DeliverableSection.create>[0]> = {}): DeliverableSection {
  return DeliverableSection.create({
    id: "section-1",
    organizationId: ORGANIZATION_ID,
    deliverableId: "deliverable-1",
    code: "INTRO",
    title: "Introduction",
    order: 0,
    headingLevel: 1,
    mandatory: true,
    occurredAt: NOW,
    ...overrides,
  });
}

function fakeAccessService(section: DeliverableSection): DeliverableAccessService {
  const deliverable = Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.TechnicalMemo, createdBy: "user-1", occurredAt: NOW });
  return { loadSectionContext: vi.fn(async () => ({ section, deliverable, clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}

function fakeClock() {
  return { now: () => NOW };
}

const baseCommand = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableSectionId: "section-1" };

describe("UpdateDeliverableSectionUseCase (mission §4 — masquage/verrouillage)", () => {
  it("locks a section, preventing future edits (assertEditable throws)", async () => {
    const section = fakeSection();
    const repository = { save: vi.fn(async () => undefined) } as unknown as DeliverableSectionRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new UpdateDeliverableSectionUseCase(fakeAccessService(section), repository, statusRecalculation, fakeClock());

    const summary = await useCase.execute({ ...baseCommand, locked: true });

    expect(summary.locked).toBe(true);
    expect(() => section.assertEditable()).toThrow();
    expect(repository.save).toHaveBeenCalledWith(section);
    expect(statusRecalculation.recomputeDeliverable).not.toHaveBeenCalled();
  });

  it("unlocks a previously locked section", async () => {
    const section = fakeSection({ locked: true });
    const repository = { save: vi.fn(async () => undefined) } as unknown as DeliverableSectionRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new UpdateDeliverableSectionUseCase(fakeAccessService(section), repository, statusRecalculation, fakeClock());

    const summary = await useCase.execute({ ...baseCommand, locked: false });

    expect(summary.locked).toBe(false);
    expect(() => section.assertEditable()).not.toThrow();
  });

  it("hiding a section triggers a deliverable status recomputation (hidden sections never count, mission §15)", async () => {
    const section = fakeSection();
    const repository = { save: vi.fn(async () => undefined) } as unknown as DeliverableSectionRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new UpdateDeliverableSectionUseCase(fakeAccessService(section), repository, statusRecalculation, fakeClock());

    const summary = await useCase.execute({ ...baseCommand, hidden: true });

    expect(summary.hidden).toBe(true);
    expect(statusRecalculation.recomputeDeliverable).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });
  });

  it("leaves fields untouched when neither locked nor hidden is provided", async () => {
    const section = fakeSection();
    const repository = { save: vi.fn(async () => undefined) } as unknown as DeliverableSectionRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new UpdateDeliverableSectionUseCase(fakeAccessService(section), repository, statusRecalculation, fakeClock());

    const summary = await useCase.execute(baseCommand);

    expect(summary.locked).toBe(false);
    expect(summary.hidden).toBe(false);
    expect(statusRecalculation.recomputeDeliverable).not.toHaveBeenCalled();
  });
});
