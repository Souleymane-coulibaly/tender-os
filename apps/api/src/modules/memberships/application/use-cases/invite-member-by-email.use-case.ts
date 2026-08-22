import { Injectable } from "@nestjs/common";
import { FindUserByEmailUseCase, UserNotFoundError } from "../../../identity";
import type { OrganizationRole } from "../../domain/organization-role";
import { assertHasPermission } from "../policies/membership-authorization.policy";
import { OrganizationPermission } from "../../domain/organization-permission";
import { CreateMembershipUseCase, type CreateMembershipResult } from "./create-membership.use-case";

export type InviteMemberByEmailCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: OrganizationRole;
  email: string;
  role: string;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
}>;

export type InviteMemberByEmailResult = CreateMembershipResult;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — "inviter un utilisateur, saisir son
 * email" côté UI, SANS créer de second système d'invitation (mission §14/§34 "réutiliser
 * exclusivement les APIs Membership existantes", "interdit: nouveau moteur"). Ce use case est une
 * simple RÉSOLUTION email -> compte existant (`FindUserByEmailUseCase`, module `identity`, port
 * `UserRepository.findByEmail` déjà en place) suivie d'une délégation INTÉGRALE à
 * `CreateMembershipUseCase` — permission (`MemberInvite`), unicité, seat-limit atomique, audit,
 * outbox : tout reste dans l'UNIQUE moteur déjà validé, jamais dupliqué ici.
 *
 * Cas honnête assumé (mission "hors périmètre : module Invitations distinct, WF-021") : si AUCUN
 * compte TenderOS n'existe pour cet email, ce use case échoue avec `UserNotFoundError` (même code que
 * l'ajout par identifiant) plutôt que d'inventer un mécanisme de pré-inscription/envoi d'email — le
 * frontend traduit ce cas en message clair ("cette personne doit d'abord créer un compte").
 * `assertHasPermission` est vérifié ICI en plus (avant même la résolution de l'email) pour ne jamais
 * révéler l'existence/non-existence d'un compte à un acteur sans droit d'invitation.
 */
@Injectable()
export class InviteMemberByEmailUseCase {
  constructor(
    private readonly findUserByEmailUseCase: FindUserByEmailUseCase,
    private readonly createMembershipUseCase: CreateMembershipUseCase,
  ) {}

  async execute(command: InviteMemberByEmailCommand): Promise<InviteMemberByEmailResult> {
    assertHasPermission(command.actorRole, OrganizationPermission.MemberInvite);

    const found = await this.findUserByEmailUseCase.execute({ email: command.email });
    if (!found) {
      throw new UserNotFoundError();
    }

    return this.createMembershipUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      userId: found.id,
      role: command.role,
      expiresAt: command.expiresAt,
      requestId: command.requestId,
    });
  }
}
