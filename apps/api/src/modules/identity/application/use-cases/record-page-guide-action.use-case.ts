import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { PageGuideKey } from "../../domain/page-guide-key.value-object";
import { PageGuideState, type PageGuideAction } from "../../domain/page-guide-state.entity";
import { PAGE_GUIDE_STATE_REPOSITORY, type PageGuideStateRepository } from "../ports/page-guide-state.repository";
import { toPageGuideStateSummary, type PageGuideStateSummary } from "../dtos";

export type RecordPageGuideActionCommand = Readonly<{ userId: string; guideKey: string; action: PageGuideAction }>;

/**
 * TENDEROS-2.1 (guides de page) — "Terminer" (COMPLETE) ou "Passer/Fermer" (DISMISS) un guide
 * contextuel. Upsert idempotent par (utilisateur, guide) : COMPLETE pose `completedAt`, DISMISS
 * pose `dismissedAt`, l'autre date n'est jamais touchée. N'importe quelle clé bien formée est
 * acceptée — le registre des guides vit dans l'application web, jamais une liste fermée ici.
 */
@Injectable()
export class RecordPageGuideActionUseCase {
  constructor(
    @Inject(PAGE_GUIDE_STATE_REPOSITORY) private readonly repository: PageGuideStateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RecordPageGuideActionCommand): Promise<PageGuideStateSummary> {
    const guideKey = PageGuideKey.from(command.guideKey);
    const occurredAt = this.clock.now();

    const state = await this.repository.apply({
      id: this.idGenerator.generate(),
      userId: command.userId,
      guideKey: guideKey.value,
      changes: PageGuideState.changesFor(command.action, occurredAt),
      occurredAt,
    });

    return toPageGuideStateSummary(state);
  }
}
