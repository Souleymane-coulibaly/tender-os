import { Inject, Injectable } from "@nestjs/common";
import { EmailAddress } from "../../domain/email-address.value-object";
import { toUserSummary, type UserSummary } from "../dtos";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type FindUserByEmailQuery = Readonly<{ email: string }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — résolveur minimal email -> compte
 * existant, réutilisé par `memberships`' `InviteMemberByEmailUseCase` pour offrir une invitation
 * "par email" SANS créer de second système d'invitation (mission §14 "réutiliser exclusivement les
 * APIs Membership existantes") : ce use case ne fait QUE traduire un email en `userId` via
 * `UserRepository.findByEmail` (port déjà existant, jamais un nouveau mécanisme), puis
 * `CreateMembershipUseCase` (déjà validé, seat-limit inclus) reste l'UNIQUE moteur d'écriture. `null`
 * en retour — jamais une exception — pour le cas nominal "personne n'a encore de compte TenderOS
 * avec cet email" : c'est à l'appelant de décider comment le présenter.
 */
@Injectable()
export class FindUserByEmailUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepository) {}

  async execute(query: FindUserByEmailQuery): Promise<UserSummary | null> {
    const email = EmailAddress.create(query.email);
    const user = await this.userRepository.findByEmail(email);
    return user ? toUserSummary(user) : null;
  }
}
