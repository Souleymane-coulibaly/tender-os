import { beforeEach, describe, expect, it } from "vitest";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermissionMissingError } from "../../domain/errors";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { Document } from "../../domain/document.aggregate";
import { FixedClock, InMemoryAuditLogWriter, wireDocumentFakes } from "../../test-support/fakes";
import { DeleteDocumentUseCase } from "./delete-document.use-case";
import { GetDocumentUseCase } from "./get-document.use-case";

describe("DeleteDocumentUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let deleteUseCase: DeleteDocumentUseCase;
  let getUseCase: GetDocumentUseCase;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    deleteUseCase = new DeleteDocumentUseCase(fakes.documentRepository, new InMemoryAuditLogWriter(), new FixedClock());
    getUseCase = new GetDocumentUseCase(fakes.documentRepository, fakes.versionRepository);

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

  it("soft-deletes a document, which then disappears from normal lookups", async () => {
    await deleteUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });

    await expect(
      getUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorRole: "ORGANIZATION_ADMIN" }),
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it("refuses when the actor lacks document:delete (Contributor tier)", async () => {
    await expect(
      deleteUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorId: "user-1", actorRole: "CONTRIBUTOR" }),
    ).rejects.toThrow(DocumentPermissionMissingError);
  });
});
