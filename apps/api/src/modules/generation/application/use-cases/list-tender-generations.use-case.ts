import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission, roleHasClientPortfolioPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import type { GenerationTaskType } from "../../domain/generation-task-type";
import { toGenerationSummary, type GenerationSummary } from "../dtos";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";

export type ListTenderGenerationsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  taskType?: GenerationTaskType | undefined;
  limit: number;
  offset: number;
}>;

export type ListTenderGenerationsResult = Readonly<{ items: readonly GenerationSummary[]; total: number }>;

/** Une ligne PAR FIL (la dernière version de chaque `rootGenerationId`) — mission §"lister les
 *  générations d'un Tender", jamais toutes les versions mélangées (voir
 *  `ListGenerationVersionsUseCase` pour l'historique complet d'un fil précis). */
@Injectable()
export class ListTenderGenerationsUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
  ) {}

  async execute(query: ListTenderGenerationsQuery): Promise<ListTenderGenerationsResult> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
      actorId: query.actorId,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGeneration,
    });

    const canSeeCost = roleHasClientPortfolioPermission(query.actorRole, ClientPermission.ViewAll);
    const page = await this.generationRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      taskType: query.taskType,
      limit: query.limit,
      offset: query.offset,
    });

    return { items: page.items.map((g) => toGenerationSummary(g, { canSeeCost })), total: page.total };
  }
}
