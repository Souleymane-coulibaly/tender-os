import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";

export type GetGenerationCapabilitiesQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/** Mêmes codes que les erreurs réellement levées par `LaunchGenerationUseCase`/
 *  `ProcessGenerationUseCase` (mission Sprint 8A.2 — "un seul vocabulaire d'erreur, jamais un
 *  second calcul divergent côté capacités") : un type de tâche marqué `ready: true` ici est
 *  garanti de ne JAMAIS échouer pour l'une de ces raisons au moment du lancement réel — la
 *  résolution utilisée est strictement identique (mêmes repositories). Checkpoint
 *  TENDEROS-2.1-P2.3-E4.1 — `NO_ACTIVE_ROUTING_POLICY` a disparu : `AiModelRouter` résout
 *  désormais TOUJOURS un modèle pour un TaskType réel (AUTOMATIC, aucune configuration requise),
 *  il n'existe donc plus de notion de "policy absente" qui bloquerait une génération. */
export type GenerationCapabilityReasonCode = "PROMPT_TEMPLATE_NOT_FOUND" | "NO_ACTIVE_PROMPT_VERSION";

export type GenerationCapability = Readonly<{
  taskType: GenerationTaskType;
  ready: boolean;
  reasonCode?: GenerationCapabilityReasonCode;
}>;

/**
 * Capacités de génération réellement configurées pour cette organisation, par type de tâche
 * (mission Sprint 8A.2, correction bugs #1/#4 — "aucune vérification en amont, le frontend
 * propose les 17 types sans jamais savoir lesquels sont réellement utilisables"). Nested sous
 * `/tenders/:tenderId` pour la même chaîne d'autorisation que le reste de l'écran Tender
 * (Tender → client → `ClientPermission.ReadGeneration`), bien que la résolution elle-même reste
 * strictement Organization-wide (le template/la version de prompt n'ont pas de scope Tender/Client).
 */
@Injectable()
export class GetGenerationCapabilitiesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
  ) {}

  async execute(query: GetGenerationCapabilitiesQuery): Promise<readonly GenerationCapability[]> {
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

    const taskTypes = Object.values(GenerationTaskType);
    return Promise.all(taskTypes.map((taskType) => this.resolveCapability(query.organizationId, taskType)));
  }

  private async resolveCapability(organizationId: string, taskType: GenerationTaskType): Promise<GenerationCapability> {
    const template = await this.promptTemplateRepository.findByTaskType({ organizationId, taskType });
    if (!template) {
      return { taskType, ready: false, reasonCode: "PROMPT_TEMPLATE_NOT_FOUND" };
    }

    const activeVersion = await this.promptVersionRepository.findActive({ organizationId, promptTemplateId: template.id });
    if (!activeVersion) {
      return { taskType, ready: false, reasonCode: "NO_ACTIVE_PROMPT_VERSION" };
    }

    // Checkpoint TENDEROS-2.1-P2.3-E4.1 — `AiModelRouter` résout TOUJOURS un modèle pour un
    // TaskType réel (AUTOMATIC, aucune configuration requise) : une fois le template/la version
    // de prompt confirmés, la génération est garantie prête, plus de vérification de routing ici.
    return { taskType, ready: true };
  }
}
