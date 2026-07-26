import { describe, expect, it, vi } from "vitest";
import type { ListUsersUseCase } from "../../../identity";
import { PlatformRole } from "../../domain/platform-role";
import { ListPlatformUsersUseCase } from "./list-platform-users.use-case";

describe("ListPlatformUsersUseCase", () => {
  it("delegates to Identity's ListUsersUseCase with the requested status filter", async () => {
    const listUsersUseCase = {
      execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ListUsersUseCase;
    const useCase = new ListPlatformUsersUseCase(listUsersUseCase);

    await useCase.execute({ actorRole: PlatformRole.Support, limit: 25, status: "SUSPENDED" });

    expect(listUsersUseCase.execute).toHaveBeenCalledWith({ cursor: undefined, limit: 25, status: "SUSPENDED" });
  });
});
