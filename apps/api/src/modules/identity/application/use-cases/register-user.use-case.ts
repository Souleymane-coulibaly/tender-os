import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { EmailAddress } from "../../domain/email-address.value-object";
import { EmailAlreadyRegisteredError, TermsNotAcceptedError } from "../../domain/errors";
import { TERMS_VERSION } from "../../domain/terms-version";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { toUserSummary, type UserSummary } from "../dtos";
import { PASSWORD_HASHER, type PasswordHasher } from "../ports/password-hasher";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type RegisterUserCommand = Readonly<{
  email: string;
  password: string;
  displayName: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  /** V2 Sprint 24 (onboarding, CGU) — obligatoire ; `RegisterBodySchema` refuse déjà `!== true`
   *  à la frontière HTTP, revérifié ici en défense en profondeur (jamais une seule couche pour
   *  un invariant légal/RGPD). La version acceptée est TOUJOURS `TERMS_VERSION` (jamais une
   *  valeur envoyée par le client — voir aussi `User.register`). */
  termsAccepted: boolean;
}>;

export type RegisterUserResult = UserSummary;

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisterUserResult> {
    if (!command.termsAccepted) {
      throw new TermsNotAcceptedError();
    }

    const email = EmailAddress.create(command.email);

    const existing = await this.userRepository.findByEmail(email);

    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const occurredAt = this.clock.now();

    const user = User.register({
      id: UserId.from(this.idGenerator.generate()),
      email,
      displayName: command.displayName,
      firstName: command.firstName,
      lastName: command.lastName,
      passwordHash,
      termsVersion: TERMS_VERSION,
      occurredAt,
    });

    await this.userRepository.save(user);

    return toUserSummary(user);
  }
}
