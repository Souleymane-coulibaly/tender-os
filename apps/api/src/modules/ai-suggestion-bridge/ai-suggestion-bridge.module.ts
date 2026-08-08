import { Global, Module, OnModuleInit } from "@nestjs/common";
import { AiSuggestionModule, AiSuggestionEntityType, AiSuggestionFieldSchemaRegistry, AI_SUGGESTION_TARGET_ACCESS_POLICY } from "../ai-suggestion";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { ApplyAiSuggestionUseCase } from "./application/use-cases/apply-ai-suggestion.use-case";
import {
  AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY,
  type AiSuggestionEntityTargetAdapter,
  type AiSuggestionEntityTargetAdapterRegistry,
} from "./application/ports/entity-target-adapter";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { BuyerFieldAdapter } from "./infrastructure/adapters/buyer-field.adapter";
import { ChecklistItemAdapter } from "./infrastructure/adapters/checklist-item.adapter";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { TenderAwardCriterionAdapter } from "./infrastructure/adapters/tender-award-criterion.adapter";
import { TenderFieldAdapter } from "./infrastructure/adapters/tender-field.adapter";
import { TenderLotFieldAdapter } from "./infrastructure/adapters/tender-lot-field.adapter";
import { TenderMilestoneAdapter } from "./infrastructure/adapters/tender-milestone.adapter";
import { TenderRequestedDocumentAdapter } from "./infrastructure/adapters/tender-requested-document.adapter";
import { TenderRiskAdapter } from "./infrastructure/adapters/tender-risk.adapter";
import { registerFindingMappingSchemas } from "./infrastructure/finding-mapping-schemas";
import { TendersAiSuggestionTargetAccessPolicy } from "./infrastructure/tenders-ai-suggestion-target-access-policy";
import { AiSuggestionBridgeController } from "./interfaces/http/ai-suggestion-bridge.controller";

/**
 * V2 Sprint 4 — pont `@Global()` entre `ai-suggestion` (générique, ne connaît jamais Tender) et
 * `tenders`/`analysis` (producteurs/consommateurs concrets), même motif que
 * `ExtractionTriggerBridgeModule` (DCE/Documents ↔ Extraction) déjà en place dans ce repo :
 * relie deux modules sans jamais faire dépendre l'un de l'autre directement.
 *
 * `@Global()` + rebind de `AI_SUGGESTION_TARGET_ACCESS_POLICY` : `ai-suggestion.module.ts` ne
 * fournit plus lui-même de valeur par défaut pour ce token (voir son commentaire) — ce module la
 * fournit pour TOUTE l'application, y compris les use cases déclarés dans `AiSuggestionModule`
 * lui-même. Si ce module n'est pas importé par `AppModule`, chaque use case retombe sur son repli
 * `DEFAULT_TARGET_ACCESS_POLICY` (Domain, aucune restriction) — aucune régression par omission,
 * mais en production ce pont DOIT être importé (même obligation déjà en vigueur pour
 * `ExtractionTriggerBridgeModule`/`RoutingPolicyBridgeModule`).
 */
@Global()
@Module({
  // IdentityModule/MembershipsModule importés directement (jamais via une réexportation transitive
  // de TendersModule, qui ne les réexporte pas) — mêmes deux dépendances que tout autre module
  // portant un contrôleur gardé par `AuthenticatedGuard`/`OrganizationMembershipGuard` (voir
  // `ai-suggestion.module.ts`/`analysis.module.ts`).
  imports: [AiSuggestionModule, TendersModule, IdentityModule, MembershipsModule],
  controllers: [AiSuggestionBridgeController],
  providers: [
    TenderFieldAdapter,
    TenderLotFieldAdapter,
    TenderAwardCriterionAdapter,
    TenderRequestedDocumentAdapter,
    TenderMilestoneAdapter,
    TenderRiskAdapter,
    BuyerFieldAdapter,
    ChecklistItemAdapter,
    {
      provide: AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY,
      useFactory: (
        tenderField: TenderFieldAdapter,
        tenderLotField: TenderLotFieldAdapter,
        awardCriterion: TenderAwardCriterionAdapter,
        requestedDocument: TenderRequestedDocumentAdapter,
        milestone: TenderMilestoneAdapter,
        risk: TenderRiskAdapter,
        buyerField: BuyerFieldAdapter,
        checklistItem: ChecklistItemAdapter,
      ): AiSuggestionEntityTargetAdapterRegistry =>
        new Map<AiSuggestionEntityType, AiSuggestionEntityTargetAdapter>([
          [AiSuggestionEntityType.TenderField, tenderField],
          [AiSuggestionEntityType.TenderLotField, tenderLotField],
          [AiSuggestionEntityType.TenderAwardCriterion, awardCriterion],
          [AiSuggestionEntityType.TenderRequestedDocument, requestedDocument],
          [AiSuggestionEntityType.TenderMilestone, milestone],
          [AiSuggestionEntityType.TenderRisk, risk],
          [AiSuggestionEntityType.BuyerField, buyerField],
          [AiSuggestionEntityType.ChecklistItem, checklistItem],
        ]),
      inject: [TenderFieldAdapter, TenderLotFieldAdapter, TenderAwardCriterionAdapter, TenderRequestedDocumentAdapter, TenderMilestoneAdapter, TenderRiskAdapter, BuyerFieldAdapter, ChecklistItemAdapter],
    },
    { provide: AI_SUGGESTION_TARGET_ACCESS_POLICY, useClass: TendersAiSuggestionTargetAccessPolicy },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
    ApplyAiSuggestionUseCase,
  ],
  exports: [AI_SUGGESTION_TARGET_ACCESS_POLICY, ApplyAiSuggestionUseCase],
})
export class AiSuggestionBridgeModule implements OnModuleInit {
  constructor(private readonly schemaRegistry: AiSuggestionFieldSchemaRegistry) {}

  /** Enregistre les schémas de validation du mapping Finding → AiSuggestion (mission §9-12) — voir
   *  `finding-mapping-schemas.ts` pour la justification de leur emplacement ici plutôt que dans
   *  `analysis` (le producteur). */
  onModuleInit(): void {
    registerFindingMappingSchemas(this.schemaRegistry);
  }
}
