import { Inject, Injectable } from "@nestjs/common";
import {
  AWARD_CRITERION_REPOSITORY,
  CreateAwardCriterionUseCase,
  UpdateAwardCriterionUseCase,
  type AwardCriterionRepository,
} from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(["name", "description", "weight", "displayOrder", "lotId", "type", "scoringMethod", "eliminationThreshold"]);
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description"]);

type CreateCriterionProposal = Readonly<{ name: string; weight: string } & Record<string, unknown>>;

/** V2 Sprint 4 §9 — mapping CriterionFinding → TENDER_AWARD_CRITERION. La lecture passe par le
 *  repository (LECTURE SEULE, jamais Prisma directement) : aucun `GetAwardCriterionUseCase` public
 *  n'existe encore côté Tenders (seule `ListAwardCriteriaUseCase` existe), même motif que
 *  `TENDER_REPOSITORY` déjà réexporté en lecture pour Extraction. */
@Injectable()
export class TenderAwardCriterionAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly repository: AwardCriterionRepository,
    private readonly createUseCase: CreateAwardCriterionUseCase,
    private readonly updateUseCase: UpdateAwardCriterionUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const criterion = await this.repository.findById({ organizationId: input.organizationId, tenderId: input.parentTenderId, criterionId: input.entityId });
    if (!criterion) {
      return { exists: false, currentValue: undefined };
    }
    const currentValue = (criterion as unknown as Record<string, unknown>)[input.fieldName];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateCriterionProposal;
      if (!proposal || typeof proposal.name !== "string" || typeof proposal.weight !== "string") {
        throw new Error("Une proposition de création de critère doit contenir au minimum name et weight.");
      }
      const created = await this.createUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        ...proposal,
      } as Parameters<CreateAwardCriterionUseCase["execute"]>[0]);
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      criterionId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      [input.fieldName]: input.value,
    } as Parameters<UpdateAwardCriterionUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new Error(`Champ critère "${fieldName}" non autorisé pour une suggestion TENDER_AWARD_CRITERION.`);
    }
  }
}
