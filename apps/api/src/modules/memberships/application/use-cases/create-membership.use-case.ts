import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { GetCurrentUserUseCase } from "../../../identity";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { MembershipAlreadyExistsError, OwnershipRequiresTransferError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationPermission } from "../../domain/organization-permission";
import { OrganizationRole, parseOrganizationRole } from "../../domain/organization-role";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type CreateMembershipCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: OrganizationRole;
  userId: string;
  role: string;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
}>;

export type CreateMembershipResult = MembershipSummary;

/**
 * Ajoute directement un utilisateur existant à une organisation (l'acteur doit déjà
 * détenir organization:member:invite). Ne couvre pas le parcours d'invitation par email
 * (module/workflow Invitations distinct, hors périmètre — WF-021).
 */
@Injectable()
export class CreateMembershipUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: CreateMembershipCommand): Promise<CreateMembershipResult> {
    assertHasPermission(command.actorRole, OrganizationPermission.MemberInvite);

    const role = parseOrganizationRole(command.role);

    // BR-ORG-002/BR-ORG-004 — le rôle OWNER ne s'obtient jamais par la création générique d'un
    // membership (ni par un ADMIN, ni par un OWNER lui-même, ni via un DTO forgé) : seuls le
    // bootstrap d'organisation (CreateOrganizationWithOwnerUseCase) et le transfert explicite
    // (TransferOrganizationOwnershipUseCase) peuvent produire un OWNER. Vérifié avant toute
    // lecture, pour qu'aucun appel direct de ce use case ne devienne une porte dérobée.
    if (role === OrganizationRole.Owner) {
      throw new OwnershipRequiresTransferError();
    }

    await this.getCurrentUserUseCase.execute({ userId: command.userId });

    const existing = await this.membershipRepository.findByOrganizationAndUser({
      organizationId: command.organizationId,
      userId: command.userId,
    });

    if (existing) {
      throw new MembershipAlreadyExistsError();
    }

    const occurredAt = this.clock.now();

    const membership = OrganizationMembership.create({
      id: MembershipId.from(this.idGenerator.generate()),
      organizationId: command.organizationId,
      userId: command.userId,
      role,
      expiresAt: command.expiresAt ? new Date(command.expiresAt) : undefined,
      occurredAt,
    });

    await this.membershipRepository.save(membership);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "organization_membership.created",
      resourceId: membership.id.value,
      requestId: command.requestId,
      metadata: { userId: command.userId, role },
    });

    // V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 round 4) — "action métier ->
    // vérification du seuil", jamais sur une lecture : le point d'écriture réel de l'ajout d'un
    // membre (voir `QuotaThresholdEventConsumersModule`, module `billing`).
    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [{ eventType: "MembershipCreated", aggregateType: "OrganizationMembership", aggregateId: membership.id.value, payload: {}, occurredAt }],
    });

    return toMembershipSummary(membership);
  }
}
