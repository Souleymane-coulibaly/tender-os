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

  get savedIds(): string[] {
    return [...this.records.keys()];
  }
}
