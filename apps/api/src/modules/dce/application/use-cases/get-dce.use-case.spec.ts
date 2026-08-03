import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { DceNotFoundError, DcePermissionMissingError } from "../../domain/errors";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { InMemoryDceRepository } from "../../test-support/fakes";
import { GetDceUseCase } from "./get-dce.use-case";

function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1", clientAccountId: "client-1" })) } as unknown as GetTenderUseCase;
}

describe("GetDceUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let getTenderUseCase: GetTenderUseCase;
  let useCase: GetDceUseCase;

  beforeEach(() => {
    dceRepository = new InMemoryDceRepository();
    getTenderUseCase = fakeGetTenderUseCase();
    useCase = new GetDceUseCase(dceRepository, getTenderUseCase);
  });

  it("returns the DCE of a tender", async () => {
    await dceRepository.seed(
      Dce.create({
        id: DceId.from("dce-1"),
        organizationId: "org-1",
        tenderId: "tender-1",
        createdByUserId: "user-1",
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "READ_ONLY" });

    expect(result.id).toBe("dce-1");
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(DceNotFoundError);
  });

  it("refuses when the actor lacks dce:read", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "SOME_UNKNOWN_ROLE" }),
    ).rejects.toThrow(DcePermissionMissingError);
  });

  // Mission Sprint 8A.2 (audit isolation inter-client) — régression : `GetTenderUseCase` doit
  // recevoir `actorId`, sinon l'affectation client de l'acteur n'est jamais vérifiée.
  it("regression guard — always calls GetTenderUseCase with actorId, never omitted (isolation inter-client)", async () => {
    await dceRepository.seed(
      Dce.create({ id: DceId.from("dce-1"), organizationId: "org-1", tenderId: "tender-1", createdByUserId: "user-1", occurredAt: new Date() }),
    );

    await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-42", actorRole: "READ_ONLY" });

    expect(getTenderUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-42" }));
  });
});
