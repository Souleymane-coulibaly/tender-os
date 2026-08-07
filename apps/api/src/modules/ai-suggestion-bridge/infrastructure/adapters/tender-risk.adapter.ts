import { Inject, Injectable } from "@nestjs/common";
import { RISK_REPOSITORY, CreateRiskUseCase, UpdateRiskUseCase, type RiskRepository } from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(["title", "description", "severity", "source", "mitigation", "assignedTo", "category", "probability", "impact", "lotId"]);
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description", "mitigation"]);

type CreateRiskProposal = Readonly<{ title: string; severity: string } & Record<string, unknown>>;

/** V2 Sprint 4 §12 — mapping RiskFinding → TENDER_RISK. `origin` reste "MANUAL" côté domaine
 *  (mission "ne pas ajouter encore l'origine IA") : la provenance IA est déjà portée par la
 *  suggestion elle-même (sourceDocumentId/sourceAnalysisAttemptId...), jamais dupliquée ici. */
@Injectable()
export class TenderRiskAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    @Inject(RISK_REPOSITORY) private readonly repository: RiskRepository,
    private readonly createUseCase: CreateRiskUseCase,
    private readonly updateUseCase: UpdateRiskUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const risk = await this.repository.findById({ organizationId: input.organizationId, tenderId: input.parentTenderId, riskId: input.entityId });
    if (!risk) {
      return { exists: false, currentValue: undefined };
    }
    const currentValue = (risk as unknown as Record<string, unknown>)[input.fieldName];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateRiskProposal;
      if (!proposal || typeof proposal.title !== "string" || typeof proposal.severity !== "string") {
        throw new Error("Une proposition de création de risque doit contenir au minimum title et severity.");
      }
      const created = await this.createUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        requestId: input.requestId,
        ...proposal,
      } as Parameters<CreateRiskUseCase["execute"]>[0]);
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      riskId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      [input.fieldName]: input.value,
    } as Parameters<UpdateRiskUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new Error(`Champ risque "${fieldName}" non autorisé pour une suggestion TENDER_RISK.`);
    }
  }
}
