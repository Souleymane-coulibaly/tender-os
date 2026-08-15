import type { SessionRepository } from "../application/ports/session.repository";
import type { Session } from "../domain/session.entity";

export class InMemorySessionRepository implements SessionRepository {
  private readonly records = new Map<string, Session>();

  async findById(id: string): Promise<Session | null> {
    return this.records.get(id) ?? null;
  }

  async save(session: Session): Promise<void> {
    this.records.set(session.id, session);
  }

  async revokeAllForUser(userId: string, occurredAt: Date): Promise<void> {
    for (const session of this.records.values()) {
      if (session.userId === userId && session.revokedAt === undefined) {
        session.revoke(occurredAt);
      }
    }
  }

  get savedIds(): string[] {
    return [...this.records.keys()];
  }
}
