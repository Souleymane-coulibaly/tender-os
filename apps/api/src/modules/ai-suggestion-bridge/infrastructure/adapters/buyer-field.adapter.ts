import { Inject, Injectable } from "@nestjs/common";
import { BUYER_REPOSITORY, CreateBuyerUseCase, UpdateBuyerUseCase, UpdateTenderUseCase, type BuyerRepository } from "../../../tenders";
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
  "legalName",
  "identifier",
  "siret",
  "addressLine",
  "postalCode",
  "city",
  "country",
  "buyerType",
  "contactName",
  "contactEmail",
  "contactPhone",
  "profileUrl",
  "notes",
]);
const MERGEABLE_FIELDS: ReadonlySet<string> = new Set(["notes"]);

type CreateBuyerProposal = Readonly<{ name: string } & Record<string, unknown>>;

/**
 * V2 Sprint 4 §5 — mapping vers BUYER_FIELD. `Buyer` n'est jamais un `ClientAccount` (mission §5) :
 * cet adaptateur ne touche jamais l'entreprise candidate. Une proposition de CRÉATION crée le
 * Buyer PUIS rattache `Tender.buyerId` (deux use cases publics distincts, jamais Prisma) — un
 * Buyer nouvellement créé sans Tender le référençant n'aurait aucun sens pour l'utilisateur.
 */
@Injectable()
export class BuyerFieldAdapter implements AiSuggestionEntityTargetAdapter {
  constructor(
    @Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository,
    private readonly createBuyerUseCase: CreateBuyerUseCase,
    private readonly updateBuyerUseCase: UpdateBuyerUseCase,
    private readonly updateTenderUseCase: UpdateTenderUseCase,
  ) {}

  isFieldMergeable(fieldName: string): boolean {
    return MERGEABLE_FIELDS.has(fieldName);
  }

  async readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      return { exists: false, currentValue: undefined };
    }
    this.assertAllowedField(input.fieldName);
    const buyer = await this.repository.findById({ organizationId: input.organizationId, buyerId: input.entityId });
    if (!buyer) {
      return { exists: false, currentValue: undefined };
    }
    const currentValue = (buyer as unknown as Record<string, unknown>)[input.fieldName];
    return { exists: currentValue !== undefined && currentValue !== null && currentValue !== "", currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    if (input.fieldName === CREATE_FIELD_SENTINEL || input.entityId === undefined) {
      const proposal = input.value as CreateBuyerProposal;
      if (!proposal || typeof proposal.name !== "string") {
        throw new Error("Une proposition de création d'acheteur doit contenir au minimum name.");
      }
      const created = await this.createBuyerUseCase.execute({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        requestId: input.requestId,
        ...proposal,
      } as Parameters<CreateBuyerUseCase["execute"]>[0]);
      await this.updateTenderUseCase.execute({
        organizationId: input.organizationId,
        tenderId: input.parentTenderId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        requestId: input.requestId,
        buyerId: created.id,
      });
      return { entityId: created.id };
    }

    this.assertAllowedField(input.fieldName);
    await this.updateBuyerUseCase.execute({
      organizationId: input.organizationId,
      buyerId: input.entityId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      requestId: input.requestId,
      [input.fieldName]: input.value,
    } as Parameters<UpdateBuyerUseCase["execute"]>[0]);
    return { entityId: input.entityId };
  }

  private assertAllowedField(fieldName: string): void {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new Error(`Champ acheteur "${fieldName}" non autorisé pour une suggestion BUYER_FIELD.`);
    }
  }
}
