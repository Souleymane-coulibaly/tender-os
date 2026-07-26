import type { Session } from "../../domain/session.entity";

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: string): Promise<Session | null>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
