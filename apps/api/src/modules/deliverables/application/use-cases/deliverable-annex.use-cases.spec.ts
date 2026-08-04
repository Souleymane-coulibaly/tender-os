import { describe, expect, it, vi } from "vitest";
import { CreateDeliverableAnnexUseCase, ListDeliverableAnnexesUseCase, UpdateDeliverableAnnexUseCase } from "./deliverable-annex.use-cases";
import type { DeliverableAnnexRepository } from "../ports/deliverable-annex.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import type { GetDocumentUseCase } from "../../../documents";
import { DeliverableAnnexNotFoundError } from "../../domain/errors";
import { DeliverableAnnex } from "../../domain/deliverable-annex.aggregate";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const DELIVERABLE_ID = "deliverable-1";

function fakeDeliverable(): Deliverable {
  return Deliverable.create({ id: DELIVERABLE_ID, organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.Annexes, createdBy: "user-1", occurredAt: NOW });
}
function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `annex-${(n += 1)}` };
}
function fakeAccessService(): DeliverableAccessService {
  return { loadDeliverable: vi.fn(async () => ({ deliverable: fakeDeliverable(), clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}
function fakeGetDocumentUseCase(): GetDocumentUseCase {
  return {
    execute: vi.fn(async ({ documentId }: { documentId: string }) => ({
      id: documentId,
      currentVersion: { id: "version-1", checksum: "abc123", sanitizedFilename: "certificat.pdf", mimeType: "application/pdf" },
    })),
  } as unknown as GetDocumentUseCase;
}
function inMemoryRepository(seed: DeliverableAnnex[] = []): DeliverableAnnexRepository {
  const rows = new Map(seed.map((a) => [a.id, a]));
  return {
    create: async (a) => {
      rows.set(a.id, a);
    },
    findById: async ({ annexId }) => rows.get(annexId) ?? null,
    listByDeliverable: async () => [...rows.values()],
    save: async (a) => {
      rows.set(a.id, a);
    },
  };
}

describe("CreateDeliverableAnnexUseCase", () => {
  it("creates an annex PENDING when no document is attached yet", async () => {
    const getDocumentUseCase = fakeGetDocumentUseCase();
    const useCase = new CreateDeliverableAnnexUseCase(fakeAccessService(), inMemoryRepository(), getDocumentUseCase, fakeClock(), fakeIdGenerator());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID, label: "CV chef de projet" });
    expect(summary.status).toBe("PENDING");
    expect(summary.label).toBe("CV chef de projet");
    expect(getDocumentUseCase.execute).not.toHaveBeenCalled();
  });

  it("creates an annex already PROVIDED when a documentId is given upfront, deriving the version reference from the VERIFIED document (mission P1-003)", async () => {
    const getDocumentUseCase = fakeGetDocumentUseCase();
    const useCase = new CreateDeliverableAnnexUseCase(fakeAccessService(), inMemoryRepository(), getDocumentUseCase, fakeClock(), fakeIdGenerator());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID, label: "Certificat", documentId: "doc-1" });
    expect(getDocumentUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1", actorId: "user-1", actorRole: "OWNER" }));
    expect(summary.status).toBe("PROVIDED");
    expect(summary.documentVersionId).toBe("version-1");
    expect(summary.documentChecksum).toBe("abc123");
    expect(summary.documentFileName).toBe("certificat.pdf");
    expect(summary.documentMimeType).toBe("application/pdf");
  });

  it("refuses a documentId that does not resolve to a real, accessible document (audit Codex P1-003)", async () => {
    const getDocumentUseCase = { execute: vi.fn(async () => { throw new Error("DOCUMENT_NOT_FOUND"); }) } as unknown as GetDocumentUseCase;
    const repository = inMemoryRepository();
    const useCase = new CreateDeliverableAnnexUseCase(fakeAccessService(), repository, getDocumentUseCase, fakeClock(), fakeIdGenerator());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID, label: "Certificat", documentId: "doc-nonexistent" })).rejects.toThrow(
      "DOCUMENT_NOT_FOUND",
    );
    expect(await repository.listByDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID })).toHaveLength(0);
  });
});

describe("UpdateDeliverableAnnexUseCase", () => {
  it("attaches a verified document to a PENDING annex and moves it to PROVIDED — mission correctif 'aucun moyen de faire avancer le statut'", async () => {
    const pending = DeliverableAnnex.create({ id: "annex-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, label: "CV chef de projet", order: 0, createdBy: "user-1", occurredAt: NOW });
    const getDocumentUseCase = fakeGetDocumentUseCase();
    const repository = inMemoryRepository([pending]);
    const useCase = new UpdateDeliverableAnnexUseCase(fakeAccessService(), repository, getDocumentUseCase);

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID, annexId: "annex-1", documentId: "doc-1" });

    expect(getDocumentUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1", actorId: "user-1", actorRole: "OWNER" }));
    expect(summary.status).toBe("PROVIDED");
    expect(summary.documentId).toBe("doc-1");
    expect(summary.documentVersionId).toBe("version-1");
    expect(summary.documentChecksum).toBe("abc123");
    expect(summary.documentFileName).toBe("certificat.pdf");
    expect(summary.documentMimeType).toBe("application/pdf");
  });

  it("refuses a documentId that does not resolve to a real, accessible document — never attached without verification (audit Codex P1-003)", async () => {
    const pending = DeliverableAnnex.create({ id: "annex-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, label: "CV", order: 0, createdBy: "user-1", occurredAt: NOW });
    const getDocumentUseCase = { execute: vi.fn(async () => { throw new Error("DOCUMENT_NOT_FOUND"); }) } as unknown as GetDocumentUseCase;
    const repository = inMemoryRepository([pending]);
    const useCase = new UpdateDeliverableAnnexUseCase(fakeAccessService(), repository, getDocumentUseCase);

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID, annexId: "annex-1", documentId: "doc-nonexistent" })).rejects.toThrow(
      "DOCUMENT_NOT_FOUND",
    );
    const stillPending = await repository.findById({ organizationId: ORGANIZATION_ID, annexId: "annex-1" });
    expect(stillPending?.status).toBe("PENDING");
  });

  it("rejects an annexId that does not exist (or belongs to a different deliverable) with DeliverableAnnexNotFoundError", async () => {
    const useCase = new UpdateDeliverableAnnexUseCase(fakeAccessService(), inMemoryRepository(), fakeGetDocumentUseCase());

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID, annexId: "annex-missing", documentId: "doc-1" }),
    ).rejects.toBeInstanceOf(DeliverableAnnexNotFoundError);
  });
});

describe("ListDeliverableAnnexesUseCase", () => {
  it("returns annexes sorted by order", async () => {
    const a1 = DeliverableAnnex.create({ id: "annex-1", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, label: "second", order: 1, createdBy: "user-1", occurredAt: NOW });
    const a2 = DeliverableAnnex.create({ id: "annex-2", organizationId: ORGANIZATION_ID, deliverableId: DELIVERABLE_ID, label: "first", order: 0, createdBy: "user-1", occurredAt: NOW });
    const useCase = new ListDeliverableAnnexesUseCase(fakeAccessService(), inMemoryRepository([a1, a2]));
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: DELIVERABLE_ID });
    expect(result.map((a) => a.label)).toEqual(["first", "second"]);
  });
});
