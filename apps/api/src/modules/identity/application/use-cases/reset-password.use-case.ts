import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { PasswordResetTokenInvalidError } from "../../domain/errors";
import { hashPasswordResetToken } from "../../domain/services/password-reset-token-secret";
import { UserId } from "../../domain/user-id.value-object";
import { PASSWORD_HASHER, type PasswordHasher } from "../ports/password-hasher";
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from "../ports/password-reset-token.repository";
import { SESSION_REPOSITORY, type SessionRepository } from "../ports/session.repository";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type ResetPasswordCommand = Readonly<{
  token: string;
  newPassword: string;
}>;

/**
 * Consommation du flow "Mot de passe oublié" (V2 Sprint 24, onboarding — décision utilisateur
 * explicite : flow minimal complet). Anti-énumération : un jeton absent, expiré, ou déjà
 * consommé renvoie TOUJOURS `PasswordResetTokenInvalidError`, jamais une nuance qui
 * distinguerait ces cas (même motif que `AuthenticateUserUseCase`/`InvalidCredentialsError`).
 * Invalide le jeton utilisé ET toute autre demande restée sans suite, puis révoque toutes les
 * sessions actives de l'utilisateur (un jeton d'accès émis avant le reset ne doit plus être
 * utilisable).
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: SessionRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const tokenHash = hashPasswordResetToken(command.token);
    const resetToken = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);

    const occurredAt = this.clock.now();

    if (!resetToken || !resetToken.isValid(occurredAt)) {
      throw new PasswordResetTokenInvalidError();
    }

    const user = await this.userRepository.findById(UserId.from(resetToken.userId));

    if (!user) {
      // Ne devrait jamais arriver (FK), mais ne révèle jamais de nuance différente.
      throw new PasswordResetTokenInvalidError();
    }

    const newPasswordHash = await this.passwordHasher.hash(command.newPassword);
    user.resetPassword(newPasswordHash, occurredAt);
    await this.userRepository.save(user);

    resetToken.markUsed(occurredAt);
    await this.passwordResetTokenRepository.save(resetToken);
    await this.passwordResetTokenRepository.invalidateActiveForUser(user.id.value, occurredAt);

    await this.sessionRepository.revokeAllForUser(user.id.value, occurredAt);
  }
}
