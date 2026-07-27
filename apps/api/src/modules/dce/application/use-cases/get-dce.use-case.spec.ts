import { beforeEach, describe, expect, it } from "vitest";
import { DceNotFoundError, DcePermissionMissingError } from "../../domain/errors";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { InMemoryDceRepository } from "../../test-support/fakes";
import { GetDceUseCase } from "./get-dce.use-case";

describe("GetDceUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let useCase: GetDceUseCase;

  beforeEach(() => {
    dceRepository = new InMemoryDceRepository();
    useCase = new GetDceUseCase(dceRepository);
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

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY" });

    expect(result.id).toBe("dce-1");
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(DceNotFoundError);
  });

  it("refuses when the actor lacks dce:read", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "SOME_UNKNOWN_ROLE" }),
    ).rejects.toThrow(DcePermissionMissingError);
  });
});
