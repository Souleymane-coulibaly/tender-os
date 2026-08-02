import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { GetGenerationUseCase } from "../../../generation";
import { plainTextToBlocks } from "../../domain/deliverable-content-blocks";
import { DeliverableRevision } from "../../domain/deliverable-revision.aggregate";
import { DeliverableRevisionSourceType } from "../../domain/deliverable-revision-source-type";
import { GenerationNotUsableForRevisionError } from "../../domain/errors";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type CreateRevisionFromGenerationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  generationId: string;
  changeNote?: string | undefined;
}>;

/**
 * Mission Sprint 8A.1 §7/§8 — matérialise une génération IA COMPLÈTE (Sprint 6) en première
 * révision éditable d'une section. Les marqueurs anti-hallucination (`[INFORMATION À COMPLÉTER]`
 * etc., mission §8) sont produits par le PROMPT lui-même (Sprint 6) — cette conversion les
 * préserve tels quels, jamais réinterprétés ou filtrés ici.
 */
@Injectable()
export class CreateRevisionFromGenerationUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    private readonly getGenerationUseCase: GetGenerationUseCase,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateRevisionFromGenerationCommand): Promise<DeliverableRevisionSummary> {
    const { section, deliverable, clientAccountId } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    section.assertEditable();

    const generation = await this.getGenerationUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      generationId: command.generationId,
    });

    if (generation.clientAccountId !== clientAccountId) {
      throw new GenerationNotUsableForRevisionError("belongs to a different client");
    }
    if (generation.targetRef !== section.id) {
      throw new GenerationNotUsableForRevisionError("was not launched for this section");
    }
    if (generation.status !== "GENERATED") {
      throw new GenerationNotUsableForRevisionError("is not GENERATED yet");
    }

    const occurredAt = this.clock.now();
    const revisionNumber = await this.revisionRepository.nextRevisionNumber({ organizationId: command.organizationId, deliverableSectionId: section.id });
    const content = plainTextToBlocks(generation.editedContent ?? generation.generatedContent ?? "");

    // Correctif audit Codex P2-001 — snapshot d'audit minimal, calculé une seule fois ici, jamais
    // recalculé ensuite : la révision reste auditable même si `Generation` évolue. Le fingerprint
    // est un hash du contenu RÉELLEMENT généré (avant édition humaine), jamais du contexte brut
    // (mission "ne duplique pas le contexte complet si cela expose inutilement des données").
    const contextFingerprint = computeSha256(Buffer.from(generation.generatedContent ?? "", "utf8"));

    const revision = DeliverableRevision.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableSectionId: section.id,
      revisionNumber,
      sourceType: DeliverableRevisionSourceType.AiGenerated,
      sourceGenerationId: generation.id,
      sourceGenerationVersionNumber: generation.version,
      aiTaskType: generation.taskType,
      aiPromptVersionId: generation.promptVersionId,
      aiModelProvider: generation.modelProvider,
      aiModelName: generation.modelKey,
      aiRoutingDecisionId: generation.routingDecisionId,
      aiContextFingerprint: contextFingerprint,
      aiGeneratedAt: generation.completedAt ? new Date(generation.completedAt) : occurredAt,
      content,
      createdBy: command.actorId,
      createdByRole: command.actorRole,
      occurredAt,
      changeNote: command.changeNote,
    });

    await this.revisionRepository.create(revision);
    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });

    return toDeliverableRevisionSummary(revision);
  }
}
