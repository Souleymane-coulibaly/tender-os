import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { DEFAULT_KNOWLEDGE_SPACE_NAME, KnowledgeSpace } from "../../domain/knowledge-space.aggregate";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_SPACE_REPOSITORY, type KnowledgeSpaceRepository } from "../ports/knowledge-space.repository";
import { toKnowledgeSpaceSummary, type KnowledgeSpaceSummary } from "../dtos";

export type GetOrCreateDefaultKnowledgeSpaceQuery = Readonly<{ organizationId: string; actorRole: string }>;

/**
 * Résout l'espace de connaissances principal d'une organisation, le créant s'il n'existe pas
 * encore (mission Sprint 5 §1 "Si un espace par défaut est préférable, il doit être créé de
 * manière idempotente") — jamais un second espace principal créé pour la même organisation : en
 * cas de course concurrente, la contrainte unique `(organizationId, name)` (migration) fait
 * échouer la seconde création, qui se rabat alors sur une relecture.
 */
@Injectable()
export class GetOrCreateDefaultKnowledgeSpaceUseCase {
  constructor(
    @Inject(KNOWLEDGE_SPACE_REPOSITORY) private readonly knowledgeSpaceRepository: KnowledgeSpaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(query: GetOrCreateDefaultKnowledgeSpaceQuery): Promise<KnowledgeSpaceSummary> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const space = await this.getOrCreate(query.organizationId);
    return toKnowledgeSpaceSummary(space);
  }

  /** Réutilisée directement (sans vérification de permission) par les use cases qui ont besoin de
   *  résoudre l'espace par défaut comme étape interne (ex. `CreateKnowledgeEntryUseCase`) — la
   *  permission pertinente est déjà vérifiée par l'appelant pour SON action réelle. */
  async getOrCreate(organizationId: string): Promise<KnowledgeSpace> {
    const existing = await this.knowledgeSpaceRepository.findByOrganizationAndName({
      organizationId,
      name: DEFAULT_KNOWLEDGE_SPACE_NAME,
    });
    if (existing) return existing;

    const occurredAt = this.clock.now();
    const space = KnowledgeSpace.create({
      id: this.idGenerator.generate(),
      organizationId,
      name: DEFAULT_KNOWLEDGE_SPACE_NAME,
      occurredAt,
    });

    try {
      await this.knowledgeSpaceRepository.create(space);
      return space;
    } catch {
      // Course concurrente (mission §"créé de manière idempotente") — une autre requête a gagné
      // la contrainte unique (organizationId, name) : la relecture ci-dessous récupère l'espace
      // réellement créé, jamais une seconde ligne.
      const raced = await this.knowledgeSpaceRepository.findByOrganizationAndName({
        organizationId,
        name: DEFAULT_KNOWLEDGE_SPACE_NAME,
      });
      if (raced) return raced;
      throw new Error("Failed to create or resolve the default knowledge space.");
    }
  }
}
