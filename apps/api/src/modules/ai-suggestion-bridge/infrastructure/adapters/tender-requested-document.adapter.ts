import { Inject, Injectable } from "@nestjs/common";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  CreateRequestedDocumentUseCase,
  UpdateRequestedDocumentUseCase,
  type RequestedDocumentRepository,
} from "../../../tenders";
import { CREATE_FIELD_SENTINEL } from "../../application/ports/entity-target-adapter";
import type {
  AiSuggestionEntityTargetAdapter,
  EntityTargetApplyInput,
  EntityTargetApplyResult,
  EntityTargetReadInput,
  EntityTargetReadResult,
} from "../../application/ports/entity-target-adapter";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "category",
  "documentType",
  "required",
  "description",
  "expirationDate",
  "displayOrder",
  "isEliminatory",
  "lotId",
  "requestedFormat",
  "signatureRequired",
  "buyerProvidedTemplate",
]);
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["description"]);

type CreateDocumentProposal = Readonly<{ name: string } & Record<string, unknown>>;

/** V2 Sprint 4 §10 — mapping RequirementFinding → TENDER_REQUESTED_DOCUMENT. */
@Injectable()
export class TenderRequestedDocumentAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly repository: RequestedDocumentRepository,
    private readonly createUseCase: CreateRequestedDocumentUseCase,
    private readonly updateUseCase: UpdateRequestedDocumentUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const document = await this.repository.findById({ organizationId: input.organizationId, tenderId: input.parentTenderId, documentId: input.entityId });
    if (!document) {
      return { exists: false, currentValue: undefined };
    }
    const currentValue = (document as unknown as Record<string, unknown>)[input.fieldName];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateDocumentProposal;
      if (!proposal || typeof proposal.name !== "string") {
        throw new Error("Une proposition de création de pièce demandée doit contenir au minimum name.");
      }
      const created = await this.createUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        ...proposal,
      } as Parameters<CreateRequestedDocumentUseCase["execute"]>[0]);
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      documentId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      [input.fieldName]: input.value,
    } as Parameters<UpdateRequestedDocumentUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new Error(`Champ pièce demandée "${fieldName}" non autorisé pour une suggestion TENDER_REQUESTED_DOCUMENT.`);
    }
  }
}
