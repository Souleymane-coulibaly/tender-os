import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import type { Deliverable } from "../../domain/deliverable.aggregate";
import type { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableNotFoundError, DeliverableSectionNotFoundError } from "../../domain/errors";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";

export type DeliverableSectionContext = { section: DeliverableSection; deliverable: Deliverable; clientAccountId: string };

/**
 * Mission Sprint 8A.1 §19 — "ne duplique jamais du code" : point d'entrée UNIQUE pour charger une
 * section avec vérification RBAC + tenant + client, réutilisé par toute la chaîne
 * génération/édition/revue/sélection-export plutôt que répété dans chaque use case.
 */
@Injectable()
export class DeliverableAccessService {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  /** Même vérification RBAC/tenant/client que `loadSectionContext`, mais au grain du livrable
   *  entier — utilisé par les livrables en overlay léger (Matrice/Checklist/Annexes, mission §14). */
  async loadDeliverable(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    deliverableId: string;
    permission: ClientPermission;
  }): Promise<{ deliverable: Deliverable; clientAccountId: string }> {
    const deliverable = await this.deliverableRepository.findById({ organizationId: input.organizationId, deliverableId: input.deliverableId });
    if (!deliverable) {
      throw new DeliverableNotFoundError();
    }
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: deliverable.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return { deliverable, clientAccountId: tender.clientAccountId };
  }

  async loadSectionContext(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    deliverableSectionId: string;
    permission: ClientPermission;
  }): Promise<DeliverableSectionContext> {
    const section = await this.sectionRepository.findById({ organizationId: input.organizationId, sectionId: input.deliverableSectionId });
    if (!section) {
      throw new DeliverableSectionNotFoundError();
    }
    const deliverable = await this.deliverableRepository.findById({ organizationId: input.organizationId, deliverableId: section.deliverableId });
    if (!deliverable) {
      throw new DeliverableNotFoundError();
    }
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: deliverable.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return { section, deliverable, clientAccountId: tender.clientAccountId };
  }
}
