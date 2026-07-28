import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import {
  CannotTransferOwnershipToSelfError,
  MembershipNotActiveError,
  MembershipNotFoundError,
  NotOrganizationOwnerError,
} from "../../domain/errors";
import { OrganizationRole } from "../../domain/organization-role";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";

export type TransferOrganizationOwnershipCommand = Readonly<{
  organizationId: string;
  actorId: string;
  newOwnerMembershipId: string;
  requestId?: string | undefined;
}>;

export type TransferOrganizationOwnershipResult = Readonly<{
  previousOwner: MembershipSummary;
  newOwner: MembershipSummary;
}>;

/**
 * BR-ORG-004 — transfert de propriété, cas d'usage métier dédié (jamais un simple
 * ChangeMembershipRole, qui refuse explicitement toute valeur OWNER — voir
 * change-membership-role.use-case.ts).
 *
 * Modèle "propriétaire unique" retenu pour cette tranche : l'ancien OWNER devient
 * ORGANIZATION_ADMIN, le nouveau titulaire devient OWNER, dans la même transaction Postgres
 * (`saveOwnershipTransfer`) — les deux changements réussissent ou échouent ensemble, l'organisation
 * ne se retrouve jamais sans OWNER à aucun instant observable.
 *
 * L'acteur courant est revérifié depuis sa Membership réelle (pas depuis le rôle déclaré par le
 * contexte de requête) : seul le titulaire OWNER actif au moment de l'exécution peut initier un
 * transfert, jamais un rôle simplement "affirmé".
 */
@Injectable()
export class TransferOrganizationOwnershipUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: TransferOrganizationOwnershipCommand): Promise<TransferOrganizationOwnershipResult> {
    const occurredAt = this.clock.now();

    // BR-ORG-004 / mission P0-2 — tout le cycle lecture→décision→écriture s'exécute à
    // l'intérieur d'une unique transaction Postgres protégée par un verrou consultatif scopé à
    // l'organisation (voir PrismaMembershipRepository.runExclusiveForOrganization). Un second
    // transfert concurrent pour la même organisation attend que le premier commite, puis relit
    // l'état réel via `context` — jamais l'état lu avant l'ouverture du verrou — et échoue donc
    // proprement (NotOrganizationOwnerError) si l'acteur n'est plus OWNER à ce moment-là.
    const { previousOwner, newOwner } = await this.membershipRepository.runExclusiveForOrganization({
      organizationId: command.organizationId,
      fn: async (context) => {
        const currentOwner = await context.findByOrganizationAndUser({
          organizationId: command.organizationId,
          userId: command.actorId,
        });

        if (!currentOwner || !currentOwner.isEffectivelyActive(occurredAt)) {
          throw new MembershipNotFoundError();
        }
        if (currentOwner.role !== OrganizationRole.Owner) {
          throw new NotOrganizationOwnerError();
        }

        const newOwner = await context.findById({
          organizationId: command.organizationId,
          membershipId: command.newOwnerMembershipId,
        });

        if (!newOwner) {
          throw new MembershipNotFoundError();
        }
        if (newOwner.id.value === currentOwner.id.value) {
          throw new CannotTransferOwnershipToSelfError();
        }
        if (!newOwner.isEffectivelyActive(occurredAt)) {
          throw new MembershipNotActiveError({ status: newOwner.status });
        }

        currentOwner.changeRole(OrganizationRole.OrganizationAdmin, occurredAt);
        newOwner.changeRole(OrganizationRole.Owner, occurredAt);

        await context.save({ previousOwner: currentOwner, newOwner });

        return { previousOwner: currentOwner, newOwner };
      },
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "organization_membership.ownership_transferred",
      resourceId: newOwner.id.value,
      requestId: command.requestId,
      metadata: {
        previousOwnerId: previousOwner.id.value,
        previousOwnerRole: OrganizationRole.Owner,
        newOwnerId: newOwner.id.value,
        transferredBy: command.actorId,
        transferredAt: occurredAt.toISOString(),
      },
    });

    return {
      previousOwner: toMembershipSummary(previousOwner),
      newOwner: toMembershipSummary(newOwner),
    };
  }
}
