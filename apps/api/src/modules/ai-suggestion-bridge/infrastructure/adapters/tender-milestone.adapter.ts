import { Inject, Injectable } from "@nestjs/common";
import { MILESTONE_REPOSITORY, CreateMilestoneUseCase, UpdateMilestoneUseCase, type MilestoneRepository } from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(["title", "description", "date", "type", "responsibleUserId", "timezone", "lotId", "mandatory"]);
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description"]);

type CreateMilestoneProposal = Readonly<{ title: string; date: string; type: string } & Record<string, unknown>>;

/** V2 Sprint 4 §11 — mapping DeadlineFinding → TENDER_MILESTONE (dates ne relevant pas d'un champ
 *  Tender générique — visite, remise, audition...). */
@Injectable()
export class TenderMilestoneAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly repository: MilestoneRepository,
    private readonly createUseCase: CreateMilestoneUseCase,
    private readonly updateUseCase: UpdateMilestoneUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const milestone = await this.repository.findById({ organizationId: input.organizationId, tenderId: input.parentTenderId, milestoneId: input.entityId });
    if (!milestone) {
      return { exists: false, currentValue: undefined };
    }
    const currentValue = (milestone as unknown as Record<string, unknown>)[input.fieldName];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateMilestoneProposal;
      if (!proposal || typeof proposal.title !== "string" || typeof proposal.date !== "string" || typeof proposal.type !== "string") {
        throw new Error("Une proposition de création de jalon doit contenir au minimum title, date et type.");
      }
      const created = await this.createUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        ...proposal,
      } as Parameters<CreateMilestoneUseCase["execute"]>[0]);
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      milestoneId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      requestId: input.requestId,
      [input.fieldName]: input.value,
    } as Parameters<UpdateMilestoneUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new Error(`Champ jalon "${fieldName}" non autorisé pour une suggestion TENDER_MILESTONE.`);
    }
  }
}
