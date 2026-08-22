import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { AI_MODEL_PREFERENCE_REPOSITORY } from "./application/ports/ai-model-preference.repository";
import { AiModelRouter } from "./application/services/ai-model-router";
import { GetAiModelPreferencesUseCase } from "./application/use-cases/get-ai-model-preferences.use-case";
import { ResetAiModelPreferenceUseCase } from "./application/use-cases/reset-ai-model-preference.use-case";
import { SetAiModelPreferenceUseCase } from "./application/use-cases/set-ai-model-preference.use-case";
import { PrismaAiModelPreferenceRepository } from "./infrastructure/prisma-ai-model-preference.repository";
import { AiRoutingPreferencesController } from "./interfaces/http/ai-routing-preferences.controller";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4 — module autonome, exporte `AiModelRouter` (mission §19/§20) pour
 * que les 4 pipelines IA existants (Analysis, Chat, Technical Memo, Generation) puissent l'importer
 * sans dépendance circulaire, même motif que `RoutingPolicyBridgeModule` (ai-benchmark, `@Global()`)
 * — mais celui-ci reste un module NORMAL, explicitement importé par chaque consommateur, jamais
 * `@Global()` : contrairement à `RoutingPolicyBridgeModule` (infrastructure partagée sans logique
 * propre), `AiModelRouter` porte une vraie logique métier (mission §9 matrice de routing) qui
 * mérite une frontière de module explicite.
 */
@Module({
  imports: [IdentityModule, MembershipsModule],
  controllers: [AiRoutingPreferencesController],
  providers: [
    GetAiModelPreferencesUseCase,
    SetAiModelPreferenceUseCase,
    ResetAiModelPreferenceUseCase,
    AiModelRouter,
    { provide: AI_MODEL_PREFERENCE_REPOSITORY, useClass: PrismaAiModelPreferenceRepository },
  ],
  exports: [AiModelRouter],
})
export class AiRoutingModule {}
