import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import {
  CreateOrganizationUseCase,
  DeleteOrganizationUseCase,
  GetOrganizationUseCase,
  type CreateOrganizationCommand,
  type OrganizationSummary,
} from "../../../organizations";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";

export type CreateOrganizationWithOwnerCommand = CreateOrganizationCommand &
  Readonly<{
    actorId: string;
    requestId?: string | undefined;
    /**
     * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, audit Codex — correctif P1) — opt-in
     * EXPLICITE, jamais un comportement par défaut : si `true`, ce bootstrap devient idempotent
     * sous concurrence réelle pour CET acteur (deux appels concurrents ne créent jamais deux
     * organisations — le second réutilise l'organisation créée par le premier). Réservé au
     * parcours onboarding (`createOrganizationAction`, mission §7 "onboarding doit être
     * idempotent"), qui est aujourd'hui l'UNIQUE appelant de cette route. Volontairement absent par
     * défaut (`undefined`/`false` -> comportement HISTORIQUE inchangé, toujours créer) : un
     * utilisateur peut légitimement posséder plusieurs organisations (mission "ne pas refondre
     * Organizations") — ce flag ne doit jamais empêcher une création VOLONTAIRE d'une organisation
     * supplémentaire par un acteur qui en possède déjà une, seulement fermer la fenêtre de course du
     * bootstrap initial.
     */
    reuseExistingIfPresent?: boolean | undefined;
  }>;

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
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateOrganizationWithOwnerCommand): Promise<OrganizationSummary> {
    if (command.reuseExistingIfPresent) {
      // Checkpoint TENDEROS-2.1-P2.3-E2, audit Codex (correctif P1) — l'INTÉGRALITÉ de la
      // séquence "vérifier si l'acteur a déjà une organisation, sinon en créer une" se déroule
      // désormais DANS une seule transaction Postgres protégée par un verrou consultatif scopé à
      // `actorId` (`runExclusiveForActor`) — jamais un "lire côté frontend PUIS écrire" (l'ancienne
      // fenêtre de course, documentée et acceptée à tort dans `onboarding-actions.ts`). Un second
      // appel concurrent pour le MÊME acteur attend la fin du premier (verrou), puis relit un état
      // qui reflète FORCÉMENT le résultat déjà committé du premier — jamais une double création.
      return this.membershipRepository.runExclusiveForActor({
        actorId: command.actorId,
        fn: () => this.bootstrapUnderLock(command),
      });
    }

    return this.createNew(command);
  }

  private async bootstrapUnderLock(command: CreateOrganizationWithOwnerCommand): Promise<OrganizationSummary> {
    // Relecture PROTÉGÉE par le verrou (jamais un état lu avant son acquisition, mission — même
    // discipline que `runExclusiveForOrganization`) : si l'acteur a DÉJÀ une organisation au moment
    // où ce verrou est acquis (que ce soit d'un appel antérieur légitime, ou d'un concurrent qui a
    // gagné la course et déjà committé), on la réutilise telle quelle, jamais une seconde création.
    const existing = await this.membershipRepository.listByUser({ userId: command.actorId, limit: 1 });
    const existingOrganizationId = existing.items[0]?.organizationId;
    if (existingOrganizationId) {
      return this.getOrganizationUseCase.execute({ id: existingOrganizationId });
    }

    return this.createNew(command);
  }

  private async createNew(command: CreateOrganizationWithOwnerCommand): Promise<OrganizationSummary> {
    const { actorId, requestId, reuseExistingIfPresent: _reuseExistingIfPresent, ...createCommand } = command;

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
