import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { EMAIL_PROVIDER, type EmailProvider } from "../../../../shared-kernel/email-provider";
import { EmailAddress } from "../../domain/email-address.value-object";
import { PasswordResetToken } from "../../domain/password-reset-token.entity";
import { generatePasswordResetToken } from "../../domain/services/password-reset-token-secret";
import { UserStatus } from "../../domain/user-status";
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from "../ports/password-reset-token.repository";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type RequestPasswordResetCommand = Readonly<{
  email: string;
}>;

/** Même motif que `appBaseUrl()` dans `ConnectorsOAuthCallbackController`/`appBillingReturnUrls`
 *  — un lien envoyé par email est TOUJOURS construit côté serveur depuis `APP_BASE_URL` + un
 *  chemin fixe, jamais depuis une valeur fournie par l'appelant. */
function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/**
 * Flow "Mot de passe oublié" (V2 Sprint 24, onboarding — décision utilisateur explicite : "flow
 * minimal complet", pas de lien mort). Anti-énumération stricte (mission 24.135/docs
 * API_GUIDELINES §14, même motif que `AuthenticateUserUseCase`) : que l'email existe ou non,
 * soit ACTIVE ou non, cette méthode résout TOUJOURS avec le même comportement observable côté
 * client, jamais une erreur qui distinguerait les cas.
 */
@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<void> {
    let email: EmailAddress;

    try {
      email = EmailAddress.create(command.email);
    } catch {
      return;
    }

    const user = await this.userRepository.findByEmail(email);

    if (!user || user.status !== UserStatus.Active) {
      return;
    }

    const occurredAt = this.clock.now();
    const { token, tokenHash } = generatePasswordResetToken();

    // Un seul lien valide à la fois par utilisateur.
    await this.passwordResetTokenRepository.invalidateActiveForUser(user.id.value, occurredAt);

    const resetToken = PasswordResetToken.issue({
      id: this.idGenerator.generate(),
      userId: user.id.value,
      tokenHash,
      issuedAt: occurredAt,
    });
    await this.passwordResetTokenRepository.save(resetToken);

    const resetLink = `${appBaseUrl()}/app/reset-password?token=${encodeURIComponent(token)}`;
    const safeName = escapeHtml(user.displayName);

    const html = `
      <p>Bonjour ${safeName},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe TenderOS.</p>
      <p><a href="${resetLink}">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    `.trim();

    const text = [
      `Bonjour ${user.displayName},`,
      "Vous avez demandé la réinitialisation de votre mot de passe TenderOS.",
      `Réinitialisez-le ici : ${resetLink}`,
      "Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    ].join("\n");

    await this.emailProvider.send({
      to: user.email.value,
      subject: "Réinitialisation de votre mot de passe TenderOS",
      html,
      text,
    });
  }
}
