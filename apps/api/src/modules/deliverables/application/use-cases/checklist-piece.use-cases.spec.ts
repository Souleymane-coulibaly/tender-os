import { describe, expect, it, vi } from "vitest";
import { CreateChecklistPieceEntryUseCase, ListChecklistPieceEntriesUseCase, UpdateChecklistPieceEntryUseCase } from "./checklist-piece.use-cases";
import type { ChecklistPieceEntryRepository } from "../ports/checklist-piece-entry.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import type { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";
import type { GetDocumentUseCase } from "../../../documents";
import { ChecklistPieceEntry } from "../../domain/checklist-piece-entry.aggregate";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";
import { ChecklistPieceEntryNotFoundError, DocumentNotUsableForDeliverableError } from "../../domain/errors";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const DELIVERABLE_ID = "deliverable-1";

function fakeDeliverable(): Deliverable {
  return Deliverable.create({ id: DELIVERABLE_ID, organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.Checklist, createdBy: "user-1", occurredAt: NOW });
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
function fakeStatusRecalculation(): DeliverableStatusRecalculationService {
  return { recomputeOverlayDeliverable: vi.fn(async () => {}) } as unknown as DeliverableStatusRecalculationService;
}
function fakeGetDocumentUseCase(): GetDocumentUseCase {
  return {
    execute: vi.fn(async ({ documentId }: { documentId: string }) => ({
      id: documentId,
      currentVersion: { id: "version-1", checksum: "abc123", sanitizedFilename: "attestation.pdf", mimeType: "application/pdf" },
    })),
  } as unknown as GetDocumentUseCase;
}
function inMemoryRepository(seed: ChecklistPieceEntry[] = []): ChecklistPieceEntryRepository {
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

describe("CreateChecklistPieceEntryUseCase", () => {
  it("creates a piece defaulting to MISSING status", async () => {
    const statusRecalculation = fakeStatusRecalculation();
    const useCase = new CreateChecklistPieceEntryUseCase(fakeAccessService(), inMemoryRepository(), statusRecalculation, fakeClock(), fakeIdGenerator());
    const summary = await useCase.execute({ ...baseCommand, name: "Attestation fiscale", mandatory: true });
    expect(summary.status).toBe("MISSING");
    expect(summary.name).toBe("Attestation fiscale");
    expect(statusRecalculation.recomputeOverlayDeliverable).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID });
  });
});

describe("UpdateChecklistPieceEntryUseCase", () => {
  it("attaching a document moves the status to PROVIDED, deriving the version reference from the VERIFIED document (mission P1-003)", async () => {
    const entry = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, name: "Attestation fiscale", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([entry]);
    const getDocumentUseCase = fakeGetDocumentUseCase();
    const statusRecalculation = fakeStatusRecalculation();
    const useCase = new UpdateChecklistPieceEntryUseCase(fakeAccessService(), repository, getDocumentUseCase, statusRecalculation, fakeClock());

    const summary = await useCase.execute({ ...baseCommand, entryId: "entry-1", documentId: "doc-1", version: "v1" });

    expect(getDocumentUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1", actorId: "user-1", actorRole: "OWNER" }));
    expect(summary.status).toBe("PROVIDED");
    expect(summary.documentId).toBe("doc-1");
    expect(summary.documentVersionId).toBe("version-1");
    expect(summary.documentChecksum).toBe("abc123");
    expect(summary.documentFileName).toBe("attestation.pdf");
    expect(summary.documentMimeType).toBe("application/pdf");
    expect(statusRecalculation.recomputeOverlayDeliverable).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID });
  });

  it("refuses a documentId that does not resolve to a real, accessible document (audit Codex P1-003)", async () => {
    const entry = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, name: "x", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([entry]);
    const getDocumentUseCase = { execute: vi.fn(async () => { throw new Error("DOCUMENT_NOT_FOUND"); }) } as unknown as GetDocumentUseCase;
    const useCase = new UpdateChecklistPieceEntryUseCase(fakeAccessService(), repository, getDocumentUseCase, fakeStatusRecalculation(), fakeClock());

    await expect(useCase.execute({ ...baseCommand, entryId: "entry-1", documentId: "doc-nonexistent" })).rejects.toThrow("DOCUMENT_NOT_FOUND");
    const stillMissing = await repository.findById({ organizationId: ORGANIZATION_ID, entryId: "entry-1" });
    expect(stillMissing?.status).toBe("MISSING");
  });

  it("refuses a document that has no uploaded version yet", async () => {
    const entry = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, name: "x", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([entry]);
    const getDocumentUseCase = { execute: vi.fn(async () => ({ id: "doc-1", currentVersion: undefined })) } as unknown as GetDocumentUseCase;
    const useCase = new UpdateChecklistPieceEntryUseCase(fakeAccessService(), repository, getDocumentUseCase, fakeStatusRecalculation(), fakeClock());

    await expect(useCase.execute({ ...baseCommand, entryId: "entry-1", documentId: "doc-1" })).rejects.toBeInstanceOf(DocumentNotUsableForDeliverableError);
  });

  it("assigns a responsible user without touching the document/status fields", async () => {
    const entry = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, name: "x", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([entry]);
    const useCase = new UpdateChecklistPieceEntryUseCase(fakeAccessService(), repository, fakeGetDocumentUseCase(), fakeStatusRecalculation(), fakeClock());

    const summary = await useCase.execute({ ...baseCommand, entryId: "entry-1", responsibleUserId: "user-9" });

    expect(summary.responsibleUserId).toBe("user-9");
    expect(summary.status).toBe("MISSING");
  });

  it("throws ChecklistPieceEntryNotFoundError for an entry belonging to a different deliverable", async () => {
    const entry = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: "other-deliverable", name: "x", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    const useCase = new UpdateChecklistPieceEntryUseCase(fakeAccessService(), inMemoryRepository([entry]), fakeGetDocumentUseCase(), fakeStatusRecalculation(), fakeClock());
    await expect(useCase.execute({ ...baseCommand, entryId: "entry-1", responsibleUserId: "user-9" })).rejects.toThrow(ChecklistPieceEntryNotFoundError);
  });
});

describe("ListChecklistPieceEntriesUseCase", () => {
  it("returns entries sorted by order", async () => {
    const e1 = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, name: "second", mandatory: true, order: 1, createdBy: "user-1", occurredAt: NOW });
    const e2 = ChecklistPieceEntry.create({ id: "entry-2", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, name: "first", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    const useCase = new ListChecklistPieceEntriesUseCase(fakeAccessService(), inMemoryRepository([e1, e2]));
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID });
    expect(result.map((e) => e.name)).toEqual(["first", "second"]);
  });
});
