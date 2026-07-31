import { Global, Module } from "@nestjs/common";
import { ROUTING_POLICY_RESOLVER } from "../../analysis/application/ports/routing-policy-resolver";
import { ROUTING_DECISION_WRITER } from "../../analysis/application/ports/routing-decision-writer";
import { AI_MODEL_REPOSITORY } from "../application/ports/ai-model.repository";
import { ROUTING_POLICY_REPOSITORY } from "../application/ports/routing-policy.repository";
import { PrismaAiModelRepository } from "./prisma-ai-model.repository";
import { PrismaRoutingPolicyRepository } from "./prisma-routing-policy.repository";
import { PrismaRoutingPolicyResolver } from "./prisma-routing-policy-resolver";
import { PrismaRoutingDecisionWriter } from "./prisma-routing-decision.writer";

/**
 * Pont `@Global()` entre `analysis` (qui définit et consomme `ROUTING_POLICY_RESOLVER` et, depuis
 * l'audit Codex P1-4, `ROUTING_DECISION_WRITER`) et `ai-benchmark` (qui les implémente) — Sprint
 * 5.2 §"Intégration Analysis". Seul module de ce sprint marqué `@Global()`, exactement documenté et
 * justifié comme `SharedKernelModule`/`DatabaseModule` : relie deux modules sans jamais faire
 * dépendre `analysis` d'`ai-benchmark` (import direct interdit, verrait un cycle Nest). Si ce
 * module n'est pas importé par `AppModule`, `ProcessAnalysisJobUseCase` reçoit `undefined` pour ces
 * deux tokens (`@Optional()`) et se comporte EXACTEMENT comme en Sprint 4.1/4.2 — aucune régression
 * possible par omission.
 */
@Global()
@Module({
  providers: [
    { provide: AI_MODEL_REPOSITORY, useClass: PrismaAiModelRepository },
    { provide: ROUTING_POLICY_REPOSITORY, useClass: PrismaRoutingPolicyRepository },
    { provide: ROUTING_POLICY_RESOLVER, useClass: PrismaRoutingPolicyResolver },
    { provide: ROUTING_DECISION_WRITER, useClass: PrismaRoutingDecisionWriter },
  ],
  exports: [ROUTING_POLICY_RESOLVER, ROUTING_DECISION_WRITER],
})
export class RoutingPolicyBridgeModule {}
