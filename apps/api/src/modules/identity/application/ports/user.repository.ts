import type { EmailAddress } from "../../domain/email-address.value-object";
import type { User } from "../../domain/user.aggregate";
import type { UserId } from "../../domain/user-id.value-object";
import type { UserStatus } from "../../domain/user-status";

export type UserPage = {
  items: User[];
  nextCursor: string | null;
};

/**
 * `users` est une identité globale, non tenant-scoped
 * (docs/04-architecture/DATABASE_DESIGN.md §5.1) — aucun organizationId ici.
 */
export interface UserRepository {
  findByEmail(email: EmailAddress): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
  list(input: { cursor?: string | undefined; limit: number; status?: UserStatus | undefined }): Promise<UserPage>;
  countByStatus(): Promise<Record<UserStatus, number>>;
  save(user: User): Promise<void>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
