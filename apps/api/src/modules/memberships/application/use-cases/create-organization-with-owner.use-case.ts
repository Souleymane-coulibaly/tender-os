import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import {
  CreateOrganizationUseCase,
  DeleteOrganizationUseCase,
  type CreateOrganizationCommand,
  type OrganizationSummary,
} from "../../../organizations";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";

export type CreateOrganizationWithOwnerCommand = CreateOrganizationCommand &
  Readonly<{ actorId: string; requestId?: string | undefined }>;

/**
 * Compose Organizations (CreateOrganizationUseCase) et Memberships pour que le créateur d'une
 * organisation en devienne automatiquement OWNER (bible/03-domain/business-rules.md BR-ORG-002)
 * — jamais deux étapes séparées côté client : sans ce cas d'usage, l'API précédente laissait
 * une organisation nouvellement créée sans aucun membre.
 *
 * Vit dans Memberships (jamais dans Organizations, qui ne doit pas dépendre de Memberships —
 * dépendance circulaire interdite, Memberships dépend déjà d'Organizations dans l'autre sens).
 *
 * Atomicité : Organizations et Memberships restent deux agrégats/tables distincts, chacun
 * avec sa propre transaction interne (`organizationRepository.save`, `membershipRepository.save`).
 * Une vraie transaction Postgres unique across les deux nécessiterait de faire fuiter un client
 * de transaction à travers la frontière de module — écarté comme disproportionné ici. Stratégie
 * retenue : compensation explicite. Si la création de la Membership OWNER échoue après que
 * l'Organization a été créée avec succès, l'Organization est immédiatement supprimée (soft
 * delete, mécanisme déjà existant) plutôt que de laisser une organisation orpheline sans OWNER.
 */
@Injectable()
export class CreateOrganizationWithOwnerUseCase {
  constructor(
    private readonly createOrganizationUseCase: CreateOrganizationUseCase,
    private readonly deleteOrganizationUseCase: DeleteOrganizationUseCase,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateOrganizationWithOwnerCommand): Promise<OrganizationSummary> {
    const { actorId, requestId, ...createCommand } = command;

    const organization = await this.createOrganizationUseCase.execute(createCommand);
    const occurredAt = this.clock.now();

    try {
      const ownerMembership = OrganizationMembership.create({
        id: MembershipId.from(this.idGenerator.generate()),
        organizationId: organization.id,
        userId: actorId,
        role: OrganizationRole.Owner,
        occurredAt,
      });

      await this.membershipRepository.save(ownerMembership);

      await this.auditLogWriter.record({
        organizationId: organization.id,
        actorId,
        action: "organization_membership.created",
        resourceId: ownerMembership.id.value,
        requestId,
        metadata: { role: OrganizationRole.Owner, ownerBootstrap: true },
      });
    } catch (error) {
      await this.deleteOrganizationUseCase.execute({ id: organization.id }).catch(() => undefined);
      throw error;
    }

    return organization;
  }
}
