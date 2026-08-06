import { beforeEach, describe, expect, it } from "vitest";
import { BuyerNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { FixedClock, InMemoryAuditLogWriter, InMemoryBuyerRepository } from "../../test-support/fakes";
import {
  ArchiveBuyerUseCase,
  CreateBuyerUseCase,
  GetBuyerUseCase,
  ListBuyersUseCase,
  RestoreBuyerUseCase,
  UpdateBuyerUseCase,
} from "./buyer.use-cases";

describe("Buyer use-cases (V2 Sprint 3 §5)", () => {
  let repository: InMemoryBuyerRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createUseCase: CreateBuyerUseCase;
  let updateUseCase: UpdateBuyerUseCase;
  let getUseCase: GetBuyerUseCase;
  let listUseCase: ListBuyersUseCase;
  let archiveUseCase: ArchiveBuyerUseCase;
  let restoreUseCase: RestoreBuyerUseCase;

  beforeEach(() => {
    repository = new InMemoryBuyerRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    const clock = new FixedClock();
    createUseCase = new CreateBuyerUseCase(repository, auditLogWriter, clock);
    updateUseCase = new UpdateBuyerUseCase(repository, auditLogWriter, clock);
    getUseCase = new GetBuyerUseCase(repository);
    listUseCase = new ListBuyersUseCase(repository);
    archiveUseCase = new ArchiveBuyerUseCase(repository, auditLogWriter, clock);
    restoreUseCase = new RestoreBuyerUseCase(repository, auditLogWriter, clock);
  });

  it("creates a buyer with only a name (mission §5 — jamais inventer un SIRET) and records audit", async () => {
    const result = await createUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
      name: "Mairie de Test",
    });

    expect(result.name).toBe("Mairie de Test");
    expect(result.siret).toBeUndefined();
    expect(auditLogWriter.entries[0]?.action).toBe("buyer.created");
  });

  it("refuses creation when the actor lacks tender:create", async () => {
    await expect(
      createUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", name: "Mairie de Test" }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("updates only the provided fields", async () => {
    const created = await createUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN", name: "Mairie de Test" });

    const updated = await updateUseCase.execute({
      organizationId: "org-1",
      buyerId: created.id,
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
      city: "Lyon",
    });

    expect(updated.city).toBe("Lyon");
    expect(updated.name).toBe("Mairie de Test");
  });

  it("throws BuyerNotFoundError when getting/updating/archiving an unknown buyer", async () => {
    await expect(getUseCase.execute({ organizationId: "org-1", buyerId: "unknown", actorRole: "ORGANIZATION_ADMIN" })).rejects.toThrow(BuyerNotFoundError);
    await expect(
      updateUseCase.execute({ organizationId: "org-1", buyerId: "unknown", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN", city: "Lyon" }),
    ).rejects.toThrow(BuyerNotFoundError);
    await expect(archiveUseCase.execute({ organizationId: "org-1", buyerId: "unknown", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" })).rejects.toThrow(
      BuyerNotFoundError,
    );
  });

  it("archives then restores a buyer", async () => {
    const created = await createUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN", name: "Mairie de Test" });

    const archived = await archiveUseCase.execute({ organizationId: "org-1", buyerId: created.id, actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });
    expect(archived.archivedAt).toBeDefined();

    const restored = await restoreUseCase.execute({ organizationId: "org-1", buyerId: created.id, actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });
    expect(restored.archivedAt).toBeUndefined();
  });

  it("list excludes archived buyers by default but includes them with includeArchived", async () => {
    const created = await createUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN", name: "Mairie de Test" });
    await archiveUseCase.execute({ organizationId: "org-1", buyerId: created.id, actorId: "user-1", actorRole: "ORGANIZATION_ADMIN" });

    const withoutArchived = await listUseCase.execute({ organizationId: "org-1", actorRole: "ORGANIZATION_ADMIN" });
    expect(withoutArchived).toHaveLength(0);

    const withArchived = await listUseCase.execute({ organizationId: "org-1", actorRole: "ORGANIZATION_ADMIN", includeArchived: true });
    expect(withArchived).toHaveLength(1);
  });

  it("scopes buyers by organization (tenant isolation)", async () => {
    await createUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "ORGANIZATION_ADMIN", name: "Mairie de Test" });

    const otherOrgList = await listUseCase.execute({ organizationId: "org-2", actorRole: "ORGANIZATION_ADMIN" });
    expect(otherOrgList).toHaveLength(0);
  });
});
