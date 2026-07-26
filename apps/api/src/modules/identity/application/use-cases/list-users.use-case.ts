import { Inject, Injectable } from "@nestjs/common";
import type { UserStatus } from "../../domain/user-status";
import { toUserSummary, type UserSummary } from "../dtos";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type ListUsersQuery = Readonly<{
  cursor?: string | undefined;
  limit: number;
  status?: UserStatus | undefined;
}>;

export type ListUsersResult = Readonly<{
  items: UserSummary[];
  nextCursor: string | null;
}>;

/**
 * Listing global des utilisateurs (identité non tenant-scoped, docs/04-architecture/DATABASE_DESIGN.md §5.1) —
 * usage réservé aux consommateurs habilités à parcourir l'ensemble des comptes
 * (ex. Platform Administration), jamais exposé à un acteur tenant ordinaire.
 */
@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepository) {}

  async execute(query: ListUsersQuery): Promise<ListUsersResult> {
    const page = await this.userRepository.list({
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    });

    return {
      items: page.items.map(toUserSummary),
      nextCursor: page.nextCursor,
    };
  }
}
