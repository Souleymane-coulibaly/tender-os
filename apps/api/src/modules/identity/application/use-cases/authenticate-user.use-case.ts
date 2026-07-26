import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { EmailAddress } from "../../domain/email-address.value-object";
import { InvalidCredentialsError } from "../../domain/errors";
import { Session } from "../../domain/session.entity";
import { toUserSummary, type UserSummary } from "../dtos";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../ports/access-token.service";
import { PASSWORD_HASHER, type PasswordHasher } from "../ports/password-hasher";
import { SESSION_REPOSITORY, type SessionRepository } from "../ports/session.repository";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type AuthenticateUserCommand = Readonly<{
  email: string;
  password: string;
}>;

export type AuthenticateUserResult = Readonly<{
  accessToken: string;
  expiresAt: string;
  user: UserSummary;
}>;

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 heure — "sessions sécurisées" (system-architecture.md §14)

@Injectable()
export class AuthenticateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokenService: AccessTokenService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AuthenticateUserCommand): Promise<AuthenticateUserResult> {
    // L'adresse email peut être syntaxiquement invalide sans que cela doive révéler
    // une information différente d'un simple échec d'authentification.
    let email: EmailAddress;

    try {
      email = EmailAddress.create(command.email);
    } catch {
      throw new InvalidCredentialsError();
    }

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.verify(command.password, user.passwordHash);

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    // Peut lever UserNotActiveError si le compte n'est pas ACTIVE.
    const occurredAt = this.clock.now();
    user.recordLogin(occurredAt);
    await this.userRepository.save(user);

    const session = Session.issue({
      id: this.idGenerator.generate(),
      userId: user.id.value,
      issuedAt: occurredAt,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });
    await this.sessionRepository.save(session);

    const accessToken = this.accessTokenService.issue(
      { userId: user.id.value, sessionId: session.id },
      ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      expiresAt: session.expiresAt.toISOString(),
      user: toUserSummary(user),
    };
  }
}
