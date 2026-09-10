import { Injectable } from "@nestjs/common";
import { ChecklistItemOrigin, ChecklistItemType, ChecklistRequirementLevel, CreateChecklistItemUseCase } from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

/** Forme validée par `CreateRequestedDocumentProposalSchema` (`finding-mapping-schemas.ts`). */
type LegacyRequestedDocumentProposal = Readonly<{
  name: string;
  category?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  lotId?: string | undefined;
}>;

/**
 * TENDEROS-2.1 — fusion des « Pièces demandées » dans la Checklist.
 *
 * Ce type de suggestion n'est plus produit depuis le V2 Sprint 6 : les exigences du DCE ciblent
 * `CHECKLIST_ITEM`. Des suggestions antérieures peuvent pourtant encore attendre une décision. Les
 * accepter crée désormais un ÉLÉMENT DE CHECKLIST, avec la correspondance de champs de la migration
 * `20261018090000` — jamais une ligne dans `tender_requested_documents`, que plus aucun code
 * n'écrit. Le type reste lisible dans l'historique des suggestions.
 *
 * `origin` vaut AI_SUGGESTION, et non MANUAL comme pour les pièces migrées : l'élément naît bien
 * d'une proposition de l'analyse, il relève donc de la réconciliation comme tout élément de cette
 * origine.
 *
 * Les suggestions de MISE À JOUR d'une pièce existante n'ont jamais été produites (le mapping
 * Sprint 4 ne proposait que des créations). Si l'une se présentait, elle est refusée explicitement
 * plutôt que redirigée au jugé vers un élément de checklist qu'elle ne désigne pas.
 */
@Injectable()
export class TenderRequestedDocumentAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(private readonly createChecklistItemUseCase: CreateChecklistItemUseCase) {}

  isFieldMergeable(_fieldName: string): boolean {
    return false;
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    this.assertCreation(input.fieldName, input.entityId);
    return { exists: false, currentValue: undefined };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    this.assertCreation(input.fieldName, input.entityId);
    const proposal = input.value as LegacyRequestedDocumentProposal;
    if (!proposal || typeof proposal.name !== "string") {
      throw new Error("Une proposition de pièce demandée doit contenir au minimum name.");
    }

    const description = [proposal.description?.trim(), proposal.category ? `Catégorie : ${proposal.category}` : undefined]
      .filter((part): part is string => part !== undefined && part !== "")
      .join("\n\n");

    const created = await this.createChecklistItemUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      requestId: input.requestId,
      title: proposal.name,
      description: description === "" ? undefined : description,
      required: proposal.required ?? false,
      requirementLevel: proposal.required ? ChecklistRequirementLevel.Mandatory : ChecklistRequirementLevel.Conditional,
      type: ChecklistItemType.AdministrativeDocument,
      lotId: proposal.lotId,
      origin: ChecklistItemOrigin.AiSuggestion,
    });
    return { entityId: created.id };
  }

  private assertCreation(fieldName: string, entityId: string | undefined): void {
    if (fieldName !== CREATE_FIELD_SENTINEL || entityId !== undefined) {
      throw new Error(
        "Les « Pièces demandées » ont été fusionnées dans la Checklist : une suggestion TENDER_REQUESTED_DOCUMENT de mise à jour ne peut plus être appliquée. Rejetez-la, puis modifiez l'élément de checklist correspondant.",
      );
    }
  }
}
