import { describe, expect, it, vi } from "vitest";
import {
  CreateComplianceMatrixEntryUseCase,
  ListComplianceMatrixEntriesUseCase,
  UpdateComplianceMatrixEntryUseCase,
  ValidateComplianceMatrixEntryUseCase,
} from "./compliance-matrix.use-cases";
import type { ComplianceMatrixEntryRepository } from "../ports/compliance-matrix-entry.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import { ComplianceMatrixEntry } from "../../domain/compliance-matrix-entry.aggregate";
import { Criticality } from "../../domain/compliance-coverage-status";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";
import { ComplianceMatrixEntryNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const DELIVERABLE_ID = "deliverable-1";

function fakeDeliverable(): Deliverable {
  return Deliverable.create({ id: DELIVERABLE_ID, organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.ComplianceMatrix, createdBy: "user-1", occurredAt: NOW });
}

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `entry-${(n += 1)}` };
}

function fakeAccessService(): DeliverableAccessService {
  return { loadDeliverable: vi.fn(async () => ({ deliverable: fakeDeliverable(), clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}

function inMemoryRepository(seed: ComplianceMatrixEntry[] = []): ComplianceMatrixEntryRepository {
  const rows = new Map(seed.map((e) => [e.id, e]));
  return {
    create: async (e) => {
      rows.set(e.id, e);
    },
    findById: async ({ entryId }) => rows.get(entryId) ?? null,
    listByDeliverable: async () => [...rows.values()],
    save: async (e) => {
      rows.set(e.id, e);
    },
  };
}

const baseCommand = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID };

describe("CreateComplianceMatrixEntryUseCase", () => {
  it("creates an entry at the next order position, defaulting coverageStatus to TO_CONFIRM", async () => {
    const repository = inMemoryRepository();
    const useCase = new CreateComplianceMatrixEntryUseCase(fakeAccessService(), repository, fakeClock(), fakeIdGenerator());

    const summary = await useCase.execute({ ...baseCommand, source: "CCTP art. 3.2", mandatory: true, criticality: Criticality.High });

    expect(summary.source).toBe("CCTP art. 3.2");
    expect(summary.coverageStatus).toBe("TO_CONFIRM");
    expect(summary.order).toBe(0);
    expect(summary.validated).toBe(false);
  });
});

describe("UpdateComplianceMatrixEntryUseCase", () => {
  it("updates the response/coverageStatus and invalidates any prior validation (mission — a modified entry is never still considered validated)", async () => {
    const entry = ComplianceMatrixEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, source: "CCTP art. 3.2", mandatory: true, criticality: Criticality.Medium, order: 0, createdBy: "user-1", occurredAt: NOW });
    entry.markValidated({ validatedBy: "user-2", occurredAt: NOW });
    const repository = inMemoryRepository([entry]);
    const useCase = new UpdateComplianceMatrixEntryUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ ...baseCommand, entryId: "entry-1", response: "Réponse mise à jour", coverageStatus: "COVERED" });

    expect(summary.response).toBe("Réponse mise à jour");
    expect(summary.coverageStatus).toBe("COVERED");
    expect(summary.validated).toBe(false);
  });

  it("throws ComplianceMatrixEntryNotFoundError for an entry belonging to a different deliverable", async () => {
    const entry = ComplianceMatrixEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: "other-deliverable", source: "x", mandatory: true, criticality: Criticality.Low, order: 0, createdBy: "user-1", occurredAt: NOW });
    const useCase = new UpdateComplianceMatrixEntryUseCase(fakeAccessService(), inMemoryRepository([entry]), fakeClock());
    await expect(useCase.execute({ ...baseCommand, entryId: "entry-1", response: "x" })).rejects.toThrow(ComplianceMatrixEntryNotFoundError);
  });
});

describe("ValidateComplianceMatrixEntryUseCase (mission §17 — ValidateDeliverable permission)", () => {
  it("marks the entry validated with the actor and timestamp", async () => {
    const entry = ComplianceMatrixEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, source: "x", mandatory: true, criticality: Criticality.Low, order: 0, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([entry]);
    const useCase = new ValidateComplianceMatrixEntryUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ ...baseCommand, entryId: "entry-1" });

    expect(summary.validated).toBe(true);
    expect(summary.validatedBy).toBe("user-1");
  });
});

describe("ListComplianceMatrixEntriesUseCase", () => {
  it("returns entries sorted by order", async () => {
    const e1 = ComplianceMatrixEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, source: "second", mandatory: true, criticality: Criticality.Low, order: 1, createdBy: "user-1", occurredAt: NOW });
    const e2 = ComplianceMatrixEntry.create({ id: "entry-2", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, source: "first", mandatory: true, criticality: Criticality.Low, order: 0, createdBy: "user-1", occurredAt: NOW });
    const useCase = new ListComplianceMatrixEntriesUseCase(fakeAccessService(), inMemoryRepository([e1, e2]));

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID });

    expect(result.map((e) => e.source)).toEqual(["first", "second"]);
  });
});
