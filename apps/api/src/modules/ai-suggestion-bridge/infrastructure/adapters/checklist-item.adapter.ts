import { Inject, Injectable } from "@nestjs/common";
import { CHECKLIST_ITEM_REPOSITORY, ChecklistItemOrigin, CreateChecklistItemUseCase, UpdateChecklistItemUseCase, type ChecklistItemRepository } from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "description",
  "type",
  "requirementLevel",
  "conditionText",
  "criticality",
  "lotId",
  "subjectType",
  "subjectSubcontractorProfileId",
  "dueDate",
  "assignedTo",
]);
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description", "conditionText"]);

type CreateChecklistItemProposal = Readonly<{ title: string } & Record<string, unknown>>;

/** V2 Sprint 6 §9-10/§20 — mapping RequirementFinding (redirection)/CriterionFinding éliminatoire/
 *  DeadlineFinding VISIT → CHECKLIST_ITEM. Toute création passant par cet adaptateur porte
 *  `origin: AI_SUGGESTION` (jamais MANUAL) — c'est le seul chemin de création qui traverse ce
 *  fichier ; une création manuelle passe directement par `CreateChecklistItemUseCase` depuis le
 *  contrôleur, jamais par ici. */
@Injectable()
export class ChecklistItemAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly repository: ChecklistItemRepository,
    private readonly createUseCase: CreateChecklistItemUseCase,
    private readonly updateUseCase: UpdateChecklistItemUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const item = await this.repository.findById({ organizationId: input.organizationId, tenderId: input.parentTenderId, itemId: input.entityId });
    if (!item) {
      return { exists: false, currentValue: undefined };
    }
    const currentValue = (item as unknown as Record<string, unknown>)[input.fieldName];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateChecklistItemProposal;
      if (!proposal || typeof proposal.title !== "string") {
        throw new Error("Une proposition de création de checklist item doit contenir au minimum title.");
      }
      const created = await this.createUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        requestId: input.requestId,
        origin: ChecklistItemOrigin.AiSuggestion,
        ...proposal,
      } as Parameters<CreateChecklistItemUseCase["execute"]>[0]);
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      itemId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      requestId: input.requestId,
      [input.fieldName]: input.value,
    } as Parameters<UpdateChecklistItemUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new Error(`Champ checklist "${fieldName}" non autorisé pour une suggestion CHECKLIST_ITEM.`);
    }
  }
}
