import type { PasswordResetToken } from "../../domain/password-reset-token.entity";

export interface PasswordResetTokenRepository {
  save(token: PasswordResetToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  /** Invalide (marque utilisés) tous les jetons encore actifs d'un utilisateur — appelé à la
   *  fois quand une nouvelle demande est émise (un seul lien valide à la fois) et après une
   *  réinitialisation réussie (le jeton consommé est déjà marqué séparément, ceci couvre les
   *  demandes précédentes restées sans suite). */
  invalidateActiveForUser(userId: string, occurredAt: Date): Promise<void>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol("PASSWORD_RESET_TOKEN_REPOSITORY");
