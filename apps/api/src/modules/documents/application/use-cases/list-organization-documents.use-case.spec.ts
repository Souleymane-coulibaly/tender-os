import { beforeEach, describe, expect, it } from "vitest";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { Document } from "../../domain/document.aggregate";
import { wireDocumentFakes } from "../../test-support/fakes";
import { ListOrganizationDocumentsUseCase } from "./list-organization-documents.use-case";

describe("ListOrganizationDocumentsUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let useCase: ListOrganizationDocumentsUseCase;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    useCase = new ListOrganizationDocumentsUseCase(fakes.documentRepository, fakes.versionRepository);

    await fakes.documentRepository.seed(
      Document.create({
        id: DocumentId.from("doc-1"),
        organizationId: "org-1",
        title: "Attestation fiscale",
        origin: DocumentOrigin.UserUpload,
        domain: DocumentDomain.Organization,
        createdByUserId: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    await fakes.documentRepository.seed(
      Document.create({
        id: DocumentId.from("doc-2"),
        organizationId: "org-1",
        title: "CCTP",
        origin: DocumentOrigin.Dce,
        domain: DocumentDomain.Tender,
        createdByUserId: "user-2",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
      }),
    );
    await fakes.documentRepository.seed(
      Document.create({
        id: DocumentId.from("doc-other-org"),
        organizationId: "org-2",
        title: "Document d'une autre organisation",
        origin: DocumentOrigin.UserUpload,
        domain: DocumentDomain.Organization,
        createdByUserId: "user-3",
        occurredAt: new Date(),
      }),
    );
  });

  it("only returns documents scoped to the caller's organization", async () => {
    const result = await useCase.execute({ organizationId: "org-1", actorRole: "READ_ONLY", limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.id)).not.toContain("doc-other-org");
  });

  it("filters by origin and domain", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorRole: "READ_ONLY",
      limit: 10,
      origin: DocumentOrigin.Dce,
    });

    expect(result.items.map((item) => item.id)).toEqual(["doc-2"]);
  });

  it("searches by title", async () => {
    const result = await useCase.execute({ organizationId: "org-1", actorRole: "READ_ONLY", limit: 10, search: "cctp" });

    expect(result.items.map((item) => item.id)).toEqual(["doc-2"]);
  });

  it("paginates with cursor and limit", async () => {
    const firstPage = await useCase.execute({ organizationId: "org-1", actorRole: "READ_ONLY", limit: 1 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await useCase.execute({
      organizationId: "org-1",
      actorRole: "READ_ONLY",
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });
});
