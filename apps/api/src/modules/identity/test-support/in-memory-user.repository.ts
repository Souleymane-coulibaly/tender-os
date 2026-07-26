import type { UserPage, UserRepository } from "../application/ports/user.repository";
import type { EmailAddress } from "../domain/email-address.value-object";
import type { User } from "../domain/user.aggregate";
import type { UserId } from "../domain/user-id.value-object";
import { UserStatus } from "../domain/user-status";

export class InMemoryUserRepository implements UserRepository {
  private readonly records = new Map<string, User>();

  async findByEmail(email: EmailAddress): Promise<User | null> {
    for (const user of this.records.values()) {
      if (user.email.equals(email)) {
        return user;
      }
    }

    return null;
  }

  async findById(id: UserId): Promise<User | null> {
    return this.records.get(id.value) ?? null;
  }

  async list(input: {
    cursor?: string | undefined;
    limit: number;
    status?: UserStatus | undefined;
  }): Promise<UserPage> {
    const all = [...this.records.values()]
      .filter((user) => !input.status || user.status === input.status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.value.localeCompare(b.id.value));

    const startIndex = input.cursor ? all.findIndex((item) => item.id.value === input.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + input.limit);
    const hasNextPage = startIndex + input.limit < all.length;

    return {
      items: page,
      nextCursor: hasNextPage ? (page[page.length - 1]?.id.value ?? null) : null,
    };
  }

  async countByStatus(): Promise<Record<UserStatus, number>> {
    const counts: Record<UserStatus, number> = {
      [UserStatus.Invited]: 0,
      [UserStatus.Active]: 0,
      [UserStatus.Suspended]: 0,
      [UserStatus.Deactivated]: 0,
    };

    for (const user of this.records.values()) {
      counts[user.status] += 1;
    }

    return counts;
  }

  async save(user: User): Promise<void> {
    this.records.set(user.id.value, user);
  }

  async seed(user: User): Promise<void> {
    await this.save(user);
  }

  get savedIds(): string[] {
    return [...this.records.keys()];
  }
}
