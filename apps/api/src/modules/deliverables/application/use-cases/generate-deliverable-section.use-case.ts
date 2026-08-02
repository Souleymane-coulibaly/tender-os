import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { LaunchGenerationUseCase, type GenerationTaskType } from "../../../generation";
import type { GenerationSummary } from "../../../generation";
import { SectionTaskTypeNotConfiguredError } from "../../domain/errors";
import { DELIVERABLE_TEMPLATE_REPOSITORY, type DeliverableTemplateRepository } from "../ports/deliverable-template.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";

export type GenerateDeliverableSectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  taskType?: GenerationTaskType | undefined;
  requestId?: string | undefined;
}>;

/**
 * Mission Sprint 8A.1 §7 — "ne recode pas un nouveau moteur IA" : délègue ENTIÈREMENT à
 * `LaunchGenerationUseCase` (Sprint 6), avec `targetRef = deliverableSectionId` (garde-fou double
 * génération déjà scopé par section grâce à ce `targetRef`). Le résultat reste PENDING/GENERATING —
 * l'appelant relit la génération via `GET /generations/:id` (Sprint 6, déjà exposé) jusqu'à
 * GENERATED, puis crée la révision via `CreateRevisionFromGenerationUseCase`.
 */
@Injectable()
export class GenerateDeliverableSectionUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    private readonly launchGenerationUseCase: LaunchGenerationUseCase,
    @Inject(DELIVERABLE_TEMPLATE_REPOSITORY) private readonly templateRepository: DeliverableTemplateRepository,
  ) {}

  async execute(command: GenerateDeliverableSectionCommand): Promise<GenerationSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    section.assertEditable();

    const taskType = command.taskType ?? (await this.resolveTaskType(command.organizationId, deliverable.templateVersionId, section.code));
    if (!taskType) {
      throw new SectionTaskTypeNotConfiguredError();
    }

    return this.launchGenerationUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: deliverable.tenderId,
      taskType,
      targetRef: section.id,
      requestId: command.requestId,
    });
  }

  private async resolveTaskType(organizationId: string, templateVersionId: string | undefined, sectionCode: string): Promise<GenerationTaskType | undefined> {
    if (!templateVersionId) return undefined;
    const version = await this.templateRepository.findVersionById({ organizationId, versionId: templateVersionId });
    const configured = version?.sections.find((s) => s.code === sectionCode)?.taskType;
    return configured as GenerationTaskType | undefined;
  }
}
