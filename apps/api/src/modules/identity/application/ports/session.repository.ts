import type { Session } from "../../domain/session.entity";

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: string): Promise<Session | null>;
  /** V2 Sprint 24 (onboarding) — révoque toutes les sessions actives d'un utilisateur après une
   *  réinitialisation de mot de passe réussie (mission "invalider les sessions existantes") :
   *  un jeton d'accès émis avant le reset ne doit plus être utilisable. */
  revokeAllForUser(userId: string, occurredAt: Date): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
