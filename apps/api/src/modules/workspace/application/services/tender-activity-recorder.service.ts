import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import type { TenderActivityType } from "../../domain/tender-activity-type";
import { TENDER_ACTIVITY_REPOSITORY, type TenderActivityRepository } from "../ports/tender-activity.repository";

/** V2 Sprint 7 (Décision 3 du plan) — projection de LECTURE utilisateur, peuplée dans la MÊME
 *  transaction applicative que l'écriture principale + AuditLog de chaque use case collaboratif
 *  (jamais un second système de vérité indépendant). `summary` doit toujours être une synthèse
 *  courte en français, jamais de contenu sensible (mission §33 — jamais un corps de commentaire
 *  complet, jamais un payload IA, jamais un token/secret) : chaque appelant construit sa propre
 *  phrase, ce service ne fait qu'écrire. */
@Injectable()
export class TenderActivityRecorderService {
  constructor(
    @Inject(TENDER_ACTIVITY_REPOSITORY) private readonly repository: TenderActivityRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async record(input: {
    organizationId: string;
    tenderId: string;
    actorId: string;
    type: TenderActivityType;
    summary: string;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<void> {
    await this.repository.create({
      id: this.idGenerator.generate(),
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      type: input.type,
      summary: input.summary,
      metadata: input.metadata,
      createdAt: this.clock.now(),
    });
  }
}
