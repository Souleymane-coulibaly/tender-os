import { Global, Module } from "@nestjs/common";
import { ROUTING_POLICY_RESOLVER } from "../../analysis/application/ports/routing-policy-resolver";
import { ROUTING_DECISION_WRITER } from "../../analysis/application/ports/routing-decision-writer";
import { ROUTING_POLICY_RESOLVER as GENERATION_ROUTING_POLICY_RESOLVER } from "../../generation/application/ports/routing-policy-resolver";
import { GENERATION_ROUTING_DECISION_WRITER } from "../../generation/application/ports/routing-decision-writer";
import { ROUTING_POLICY_RESOLVER as CHAT_ROUTING_POLICY_RESOLVER } from "../../chat/application/ports/routing-policy-resolver";
import { ROUTING_DECISION_WRITER as CHAT_ROUTING_DECISION_WRITER } from "../../chat/application/ports/routing-decision-writer";
import { ROUTING_POLICY_RESOLVER as TECHNICAL_MEMO_ROUTING_POLICY_RESOLVER } from "../../technical-memo/application/ports/routing-policy-resolver";
import { ROUTING_DECISION_WRITER as TECHNICAL_MEMO_ROUTING_DECISION_WRITER } from "../../technical-memo/application/ports/routing-decision-writer";
import { PRICING_SNAPSHOT_READER } from "../../pricing/application/ports/pricing-snapshot-reader";
import { ROUTING_MODEL_READER } from "../../pricing/application/ports/routing-model-reader";
import { AI_MODEL_REPOSITORY } from "../application/ports/ai-model.repository";
import { PRICING_SNAPSHOT_REPOSITORY } from "../application/ports/pricing-snapshot.repository";
import { ROUTING_POLICY_REPOSITORY } from "../application/ports/routing-policy.repository";
import { PrismaAiModelRepository } from "./prisma-ai-model.repository";
import { PrismaPricingSnapshotRepository } from "./prisma-pricing-snapshot.repository";
import { PrismaPricingSnapshotReader } from "./prisma-pricing-snapshot-reader";
import { AiRoutingModule } from "../../ai-routing/ai-routing.module";
import { AiRouterRoutingModelReader } from "./ai-router-routing-model-reader";
import { PrismaRoutingPolicyRepository } from "./prisma-routing-policy.repository";
import { PrismaRoutingPolicyResolver } from "./prisma-routing-policy-resolver";
import { PrismaRoutingDecisionWriter } from "./prisma-routing-decision.writer";
import { PrismaGenerationRoutingDecisionWriter } from "./prisma-generation-routing-decision.writer";
import { PrismaChatRoutingDecisionWriter } from "./prisma-chat-routing-decision.writer";
import { PrismaTechnicalMemoRoutingDecisionWriter } from "./prisma-technical-memo-routing-decision.writer";

/**
 * Pont `@Global()` entre `analysis` (qui définit et consomme `ROUTING_POLICY_RESOLVER` et, depuis
 * l'audit Codex P1-4, `ROUTING_DECISION_WRITER`) et `ai-benchmark` (qui les implémente) — Sprint
 * 5.2 §"Intégration Analysis". Seul module de ce sprint marqué `@Global()`, exactement documenté et
 * justifié comme `SharedKernelModule`/`DatabaseModule` : relie deux modules sans jamais faire
 * dépendre `analysis` d'`ai-benchmark` (import direct interdit, verrait un cycle Nest). Si ce
 * module n'est pas importé par `AppModule`, `ProcessAnalysisJobUseCase` reçoit `undefined` pour ces
 * deux tokens (`@Optional()`) et se comporte EXACTEMENT comme en Sprint 4.1/4.2 — aucune régression
 * possible par omission.
 *
 * Correctif Sprint 6 (audit Codex P1-1/P1-2) — extension supplémentaire, toujours additive, jamais
 * une réécriture : `resolveActive()` (via CE MÊME `PrismaRoutingPolicyResolver`, zéro logique
 * spécifique à Analysis — son `promptKey` est déjà un `string` brut) retourne désormais une vraie
 * décision pour Generation dès qu'une `RoutingPolicy` ACTIVE existe pour son `taskType` (le typage
 * `promptKey` d'ai-benchmark a été élargi à `string`, voir `RoutingPolicy` domain + schemas.ts,
 * `ROUTABLE_TASK_KEYS`) — l'intégration n'est plus dormante. `GENERATION_ROUTING_DECISION_WRITER`
 * (port PROPRE à Generation, structurellement proche de `ROUTING_DECISION_WRITER` d'Analysis) est
 * lié à `PrismaGenerationRoutingDecisionWriter`, qui persiste une VRAIE `RoutingDecision`
 * (`generationId` renseigné, `analysisId` laissé `null`) et calcule son coût réel via
 * `PRICING_SNAPSHOT_REPOSITORY` (correctif P2-3) — jamais une configuration statique.
 *
 * Sprint 7 (AI Pricing & Prévisions) — extension additive : `ROUTING_MODEL_READER`/
 * `PRICING_SNAPSHOT_READER` (ports PROPRES à `pricing`, jamais un import des ports internes déjà
 * liés ci-dessus) permettent à `PreviewGenerationCostUseCase`/`CreatePricingEstimateUseCase` de
 * savoir quel modèle serait routé pour un `taskType` et son tarif COURANT — uniquement pour une
 * prévision, jamais pour recalculer un coût technique déjà figé (voir `GenerationCostReader`,
 * propre à `pricing`, qui lit directement `Generation` sans passer par ce pont).
 */
@Global()
@Module({
  // `AiModelRouter` : le modèle d'une prévision de coût est celui réellement choisi à l'appel.
  imports: [AiRoutingModule],
  providers: [
    { provide: AI_MODEL_REPOSITORY, useClass: PrismaAiModelRepository },
    { provide: PRICING_SNAPSHOT_REPOSITORY, useClass: PrismaPricingSnapshotRepository },
    { provide: ROUTING_POLICY_REPOSITORY, useClass: PrismaRoutingPolicyRepository },
    { provide: ROUTING_POLICY_RESOLVER, useClass: PrismaRoutingPolicyResolver },
    { provide: ROUTING_DECISION_WRITER, useClass: PrismaRoutingDecisionWriter },
    { provide: GENERATION_ROUTING_POLICY_RESOLVER, useClass: PrismaRoutingPolicyResolver },
    { provide: GENERATION_ROUTING_DECISION_WRITER, useClass: PrismaGenerationRoutingDecisionWriter },
    // Prévisions de coût : modèle réellement choisi à l'appel (`AiModelRouter`), jamais une
    // RoutingPolicy (retirée du chemin runtime, onglet supprimé de Configuration IA).
    { provide: ROUTING_MODEL_READER, useClass: AiRouterRoutingModelReader },
    { provide: PRICING_SNAPSHOT_READER, useClass: PrismaPricingSnapshotReader },
    // Consolidation IA — Checkpoint A §3 : même resolver, zéro nouvelle classe — Chat et Mémoire
    // technique rejoignent le même moteur de routing qu'Analyse/Génération (jamais un second
    // mécanisme).
    { provide: CHAT_ROUTING_POLICY_RESOLVER, useClass: PrismaRoutingPolicyResolver },
    { provide: TECHNICAL_MEMO_ROUTING_POLICY_RESOLVER, useClass: PrismaRoutingPolicyResolver },
    // Consolidation IA — Checkpoint D : writer de décision pour Chat/Mémoire technique, régime
    // BEST-EFFORT (même motif qu'Analyse, jamais celui, obligatoire, de Génération) — comble le
    // trou explicitement laissé ouvert par Checkpoint A (résolution câblée, audit trail absent).
    { provide: CHAT_ROUTING_DECISION_WRITER, useClass: PrismaChatRoutingDecisionWriter },
    { provide: TECHNICAL_MEMO_ROUTING_DECISION_WRITER, useClass: PrismaTechnicalMemoRoutingDecisionWriter },
  ],
  exports: [
    ROUTING_POLICY_RESOLVER,
    ROUTING_DECISION_WRITER,
    GENERATION_ROUTING_POLICY_RESOLVER,
    GENERATION_ROUTING_DECISION_WRITER,
    ROUTING_MODEL_READER,
    PRICING_SNAPSHOT_READER,
    CHAT_ROUTING_POLICY_RESOLVER,
    TECHNICAL_MEMO_ROUTING_POLICY_RESOLVER,
    CHAT_ROUTING_DECISION_WRITER,
    TECHNICAL_MEMO_ROUTING_DECISION_WRITER,
  ],
})
export class RoutingPolicyBridgeModule {}
