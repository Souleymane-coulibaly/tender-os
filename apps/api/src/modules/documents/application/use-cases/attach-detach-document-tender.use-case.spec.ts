import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import {
  DocumentTenderAssociationNotFoundError,
  DuplicateDocumentTenderAssociationError,
} from "../../domain/errors";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { Document } from "../../domain/document.aggregate";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryDocumentTenderAssociationRepository,
  wireDocumentFakes,
} from "../../test-support/fakes";
import { AttachDocumentToTenderUseCase } from "./attach-document-to-tender.use-case";
import { DetachDocumentFromTenderUseCase } from "./detach-document-from-tender.use-case";

function fakeGetTenderUseCase(executeImpl?: () => Promise<unknown>): GetTenderUseCase {
  return { execute: vi.fn(executeImpl ?? (async () => ({ id: "tender-1" }))) } as unknown as GetTenderUseCase;
}

describe("AttachDocumentToTenderUseCase / DetachDocumentFromTenderUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let associationRepository: InMemoryDocumentTenderAssociationRepository;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    associationRepository = new InMemoryDocumentTenderAssociationRepository();

    await fakes.documentRepository.seed(
      Document.create({
        id: DocumentId.from("doc-1"),
        organizationId: "org-1",
        title: "Rapport",
        origin: DocumentOrigin.UserUpload,
        domain: DocumentDomain.Organization,
        createdByUserId: "user-1",
        occurredAt: new Date(),
      }),
    );
  });

  it("attaches a document to a tender of the same organization", async () => {
    const useCase = new AttachDocumentToTenderUseCase(
      fakes.documentRepository,
      associationRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      fakeGetTenderUseCase(),
    );

    const result = await useCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
    });

    expect(result.documentId).toBe("doc-1");
    expect(result.tenderId).toBe("tender-1");
    expect(await associationRepository.exists({ organizationId: "org-1", documentId: "doc-1", tenderId: "tender-1" })).toBe(
      true,
    );
  });

  it("propagates TenderNotFoundError when the tender does not belong to this organization", async () => {
    const useCase = new AttachDocumentToTenderUseCase(
      fakes.documentRepository,
      associationRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      fakeGetTenderUseCase(async () => {
        throw new Error("TENDER_NOT_FOUND");
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        documentId: "doc-1",
        tenderId: "tender-of-another-org",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
      }),
    ).rejects.toThrow("TENDER_NOT_FOUND");
  });

  it("refuses a duplicate association", async () => {
    const useCase = new AttachDocumentToTenderUseCase(
      fakes.documentRepository,
      associationRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      fakeGetTenderUseCase(),
    );
    await useCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
    });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        documentId: "doc-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
      }),
    ).rejects.toThrow(DuplicateDocumentTenderAssociationError);
  });

  it("detaches without deleting the document itself", async () => {
    const attachUseCase = new AttachDocumentToTenderUseCase(
      fakes.documentRepository,
      associationRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      fakeGetTenderUseCase(),
    );
    await attachUseCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
    });

    const detachUseCase = new DetachDocumentFromTenderUseCase(associationRepository, new InMemoryAuditLogWriter());
    await detachUseCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
    });

    expect(await associationRepository.exists({ organizationId: "org-1", documentId: "doc-1", tenderId: "tender-1" })).toBe(
      false,
    );
    expect(await fakes.documentRepository.findById({ organizationId: "org-1", documentId: "doc-1" })).not.toBeNull();
  });

  it("refuses to detach an association that does not exist", async () => {
    const detachUseCase = new DetachDocumentFromTenderUseCase(associationRepository, new InMemoryAuditLogWriter());

    await expect(
      detachUseCase.execute({
        organizationId: "org-1",
        documentId: "doc-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
      }),
    ).rejects.toThrow(DocumentTenderAssociationNotFoundError);
  });
});
