import { Injectable } from "@nestjs/common";
import {
  CreateTenderLotUseCase,
  GetTenderLotUseCase,
  UpdateTenderLotUseCase,
  type TenderLotSummary,
} from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

/** `lotNumber`/`tenderId`/`organizationId` restent immuables après création (conception Tenders
 *  Lots §B) — jamais un champ modifiable par suggestion. */
const ALLOWED_FIELDS: ReadonlySet<keyof TenderLotSummary> = new Set([
  "title",
  "description",
  "estimatedAmount",
  "currency",
  "code",
  "cpvMain",
  "cpvSecondary",
  "executionLocation",
  "durationMonths",
  "estimatedStartDate",
  "minimumAmount",
  "maximumAmount",
  "selectedForResponse",
  "soloAllowed",
  "groupAllowed",
  "variantsAllowed",
  "pseAllowed",
  "specificVisitRequired",
  "specificVisitDate",
  "internalNotes",
]);

const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description", "internalNotes", "cpvSecondary"]);

type CreateLotProposal = Readonly<{ lotNumber: string; title: string } & Record<string, unknown>>;

@Injectable()
export class TenderLotFieldAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    private readonly getTenderLotUseCase: GetTenderLotUseCase,
    private readonly createTenderLotUseCase: CreateTenderLotUseCase,
    private readonly updateTenderLotUseCase: UpdateTenderLotUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const lot = await this.getTenderLotUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      lotId: input.entityId,
      actorRole: input.actorRole,
    });
    const currentValue = lot[input.fieldName as keyof TenderLotSummary];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateLotProposal;
      if (!proposal || typeof proposal.lotNumber !== "string" || typeof proposal.title !== "string") {
        throw new Error("Une proposition de création de lot doit contenir au minimum lotNumber et title.");
      }
      const created = await this.createTenderLotUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        requestId: input.requestId,
        ...proposal,
      } as Parameters<CreateTenderLotUseCase["execute"]>[0]);
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateTenderLotUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      lotId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      requestId: input.requestId,
      [input.fieldName]: input.value,
    } as Parameters<UpdateTenderLotUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName as keyof TenderLotSummary)) {
      throw new Error(`Champ TenderLot "${fieldName}" non autorisé pour une suggestion TENDER_LOT_FIELD.`);
    }
  }
}
