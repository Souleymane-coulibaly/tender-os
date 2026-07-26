import { beforeEach, describe, expect, it } from "vitest";
import { DocumentArchivedError, DocumentNotArchivedError, DocumentNotFoundError } from "../../domain/errors";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { Document } from "../../domain/document.aggregate";
import { FixedClock, InMemoryAuditLogWriter, wireDocumentFakes } from "../../test-support/fakes";
import { ArchiveDocumentUseCase } from "./archive-document.use-case";
import { RestoreDocumentUseCase } from "./restore-document.use-case";

describe("ArchiveDocumentUseCase / RestoreDocumentUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let archiveUseCase: ArchiveDocumentUseCase;
  let restoreUseCase: RestoreDocumentUseCase;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    const auditLogWriter = new InMemoryAuditLogWriter();
    archiveUseCase = new ArchiveDocumentUseCase(fakes.documentRepository, auditLogWriter, new FixedClock());
    restoreUseCase = new RestoreDocumentUseCase(fakes.documentRepository, auditLogWriter, new FixedClock());

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

  it("archives a document and then refuses archiving it again", async () => {
    const result = await archiveUseCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
    });

    expect(result.status).toBe("ARCHIVED");
    expect(result.archivedAt).toBeDefined();

    await expect(
      archiveUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" }),
    ).rejects.toThrow(DocumentArchivedError);
  });

  it("restores an archived document", async () => {
    await archiveUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });

    const result = await restoreUseCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
    });

    expect(result.status).toBe("ACTIVE");
  });

  it("refuses to restore a document that was never archived", async () => {
    await expect(
      restoreUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" }),
    ).rejects.toThrow(DocumentNotArchivedError);
  });

  it("throws DocumentNotFoundError for a document in another organization", async () => {
    await expect(
      archiveUseCase.execute({ organizationId: "org-2", documentId: "doc-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" }),
    ).rejects.toThrow(DocumentNotFoundError);
  });
});
