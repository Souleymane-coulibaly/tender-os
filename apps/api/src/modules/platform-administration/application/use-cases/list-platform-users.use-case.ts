import { Injectable } from "@nestjs/common";
import { ListUsersUseCase, UserStatus, type UserSummary } from "../../../identity";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import { assertHasCapability } from "../policies/platform-authorization.policy";

export type ListPlatformUsersQuery = Readonly<{
  actorRole: PlatformRole;
  cursor?: string | undefined;
  limit: number;
  status?: UserStatus | undefined;
}>;

export type ListPlatformUsersResult = Readonly<{
  items: UserSummary[];
  nextCursor: string | null;
}>;

/**
 * "consulter les comptes désactivés ou suspendus" se fait via `status`
 * (SUSPENDED | DEACTIVATED) plutôt qu'un endpoint dédié — un seul filtre, cohérent avec
 * le catalogue de statuts déjà documenté (docs/04-architecture/DATABASE_DESIGN.md §5.1).
 */
@Injectable()
export class ListPlatformUsersUseCase {
  constructor(private readonly listUsersUseCase: ListUsersUseCase) {}

  async execute(query: ListPlatformUsersQuery): Promise<ListPlatformUsersResult> {
    assertHasCapability(query.actorRole, PlatformCapability.UsersRead);

    return this.listUsersUseCase.execute({
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    });
  }
}
