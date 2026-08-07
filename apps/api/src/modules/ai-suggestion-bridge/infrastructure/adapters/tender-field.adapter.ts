import { Injectable } from "@nestjs/common";
import { GetTenderUseCase, UpdateTenderUseCase, type TenderSummary } from "../../../tenders";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

/** Champs Tender modifiables par une suggestion TENDER_FIELD (mission §6/§9 — sous-ensemble
 *  pratique des champs généraux du Tender, jamais clientAccountId ni status, gérés par des flux
 *  contrôlés dédiés — voir tenders/tender.aggregate.ts). */
const ALLOWED_FIELDS: ReadonlySet<keyof TenderSummary> = new Set([
  "title",
  "reference",
  "buyerName",
  "description",
  "publicationDate",
  "submissionDeadline",
  "submissionDeadlineTimezone",
  "questionsDeadline",
  "visitDate",
  "visitMandatory",
  "contractDurationMonths",
  "renewalDurationMonths",
  "renewalCount",
  "estimatedStartDate",
  "executionLocation",
  "geographicZone",
  "isFrameworkAgreement",
  "awardType",
  "variantsAllowed",
  "pseAllowed",
  "electronicResponseMandatory",
  "signatureRequired",
  "submissionPlatformUrl",
  "internalNotes",
  "procedureType",
  "estimatedAmount",
  "minimumAmount",
  "maximumAmount",
]);

/** Seuls les champs texte libre se prêtent à une fusion simple (§12). */
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description", "internalNotes"]);

@Injectable()
export class TenderFieldAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly updateTenderUseCase: UpdateTenderUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    this.assertAllowedField(input.fieldName);
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    const currentValue = tender[input.fieldName as keyof TenderSummary];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    this.assertAllowedField(input.fieldName);
    await this.updateTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      requestId: input.requestId,
      [input.fieldName]: input.value,
    } as Parameters<UpdateTenderUseCase["execute"]>[0]);
    return { entityId: input.parentTenderId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName as keyof TenderSummary)) {
      throw new Error(`Champ Tender "${fieldName}" non autorisé pour une suggestion TENDER_FIELD.`);
    }
  }
}
