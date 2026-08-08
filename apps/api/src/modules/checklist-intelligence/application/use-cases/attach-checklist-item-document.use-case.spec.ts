import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentVersionRepository, GetDocumentUseCase } from "../../../documents";
import { ChecklistItem } from "../../../tenders";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryChecklistItemRepository,
  InMemoryTenderRepository,
  FakeOutboxWriter,
} from "../../../tenders/test-support/fakes";
import { AttachChecklistItemDocumentUseCase, DetachChecklistItemDocumentUseCase } from "./attach-checklist-item-document.use-case";

describe("AttachChecklistItemDocumentUseCase / DetachChecklistItemDocumentUseCase", () => {
  let checklistRepository: InMemoryChecklistItemRepository;
  let tenderRepository: InMemoryTenderRepository;
  let getDocumentUseCase: { execute: ReturnType<typeof vi.fn> };
  let documentVersionRepository: { findById: ReturnType<typeof vi.fn> };
  let attachUseCase: AttachChecklistItemDocumentUseCase;
  let detachUseCase: DetachChecklistItemDocumentUseCase;

  beforeEach(async () => {
    checklistRepository = new InMemoryChecklistItemRepository();
    tenderRepository = new InMemoryTenderRepository();
    getDocumentUseCase = { execute: vi.fn(async () => ({ id: "doc-1" })) };
    // Correctif audit Codex P1 — `documentVersionId` n'est validé que via ce port (dénormalisé, pas
    // de FK, voir `schema.prisma`) : par défaut la version existe et appartient bien à "doc-1".
    documentVersionRepository = { findById: vi.fn(async () => ({ id: "version-1" })) };
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");

    attachUseCase = new AttachChecklistItemDocumentUseCase(
      checklistRepository,
      new InMemoryAuditLogWriter(),
      new FakeOutboxWriter(),
      new FixedClock(),
      tenderRepository,
      documentVersionRepository as unknown as DocumentVersionRepository,
      clientPortfolio.assertClientAccessUseCase,
      getDocumentUseCase as unknown as GetDocumentUseCase,
    );
    detachUseCase = new DetachChecklistItemDocumentUseCase(checklistRepository, new InMemoryAuditLogWriter(), new FixedClock(), tenderRepository, clientPortfolio.assertClientAccessUseCase);

    await tenderRepository.seed(
      Tender.create({ id: TenderId.from("tender-1"), organizationId: "org-1", clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID, title: "Marche", createdBy: "user-1", occurredAt: new Date() }),
    );
    await checklistRepository.save(ChecklistItem.create({ id: "item-1", organizationId: "org-1", tenderId: "tender-1", title: "Attestation", occurredAt: new Date() }));
  });

  it("attaches a document, verifying it belongs to the organization first (via GetDocumentUseCase)", async () => {
    const result = await attachUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      itemId: "item-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      documentId: "doc-1",
      matchStatus: "MANUALLY_ATTACHED",
    });

    expect(getDocumentUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", documentId: "doc-1" }));
    expect(result.matchedDocumentId).toBe("doc-1");
    expect(result.documentStatus).toBe("AVAILABLE");
    expect(result.complianceStatus).toBe("READY");
  });

  it("rejects a documentId that does not belong to this organization (propagates DocumentNotFoundError)", async () => {
    getDocumentUseCase.execute = vi.fn(async () => {
      throw new Error("DOCUMENT_NOT_FOUND");
    });

    await expect(
      attachUseCase.execute({ organizationId: "org-1", tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "BID_MANAGER", documentId: "doc-cross-tenant", matchStatus: "MANUALLY_ATTACHED" }),
    ).rejects.toThrow("DOCUMENT_NOT_FOUND");
  });

  // Correctif audit Codex P1 — `documentVersionId` est dénormalisé (aucune FK) : sans cette
  // vérification, une version inexistante, appartenant à un autre document, ou à une autre
  // organisation, serait persistée telle quelle sur le ChecklistItem.
  it("rejects a documentVersionId that does not exist, or does not belong to this document/organization", async () => {
    documentVersionRepository.findById = vi.fn(async () => null);

    await expect(
      attachUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        itemId: "item-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        documentId: "doc-1",
        documentVersionId: "version-from-another-document",
        matchStatus: "MANUALLY_ATTACHED",
      }),
    ).rejects.toThrow("Document version not found.");

    expect(documentVersionRepository.findById).toHaveBeenCalledWith({
      organizationId: "org-1",
      documentId: "doc-1",
      versionId: "version-from-another-document",
    });
    expect(checklistRepository.items.find((item) => item.id === "item-1")?.matchedDocumentId).toBeUndefined();
  });

  it("detaches a document and reverts complianceStatus to TO_REVIEW", async () => {
    await attachUseCase.execute({ organizationId: "org-1", tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "BID_MANAGER", documentId: "doc-1", matchStatus: "MANUALLY_ATTACHED" });

    const result = await detachUseCase.execute({ organizationId: "org-1", tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.matchedDocumentId).toBeUndefined();
    expect(result.documentStatus).toBe("MISSING");
    expect(result.complianceStatus).toBe("TO_REVIEW");
  });

  it("refuses when the actor lacks tender:manage_checklist", async () => {
    await expect(
      attachUseCase.execute({ organizationId: "org-1", tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "READ_ONLY", documentId: "doc-1", matchStatus: "MANUALLY_ATTACHED" }),
    ).rejects.toThrow();
  });
});
