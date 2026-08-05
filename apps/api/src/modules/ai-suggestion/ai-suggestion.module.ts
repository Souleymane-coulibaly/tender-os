import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { DatabaseModule } from "../../shared-kernel/database.module";
import { SharedKernelModule } from "../../shared-kernel/shared-kernel.module";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY } from "./application/ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY } from "./application/ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "./application/services/ai-suggestion-field-schema-registry";
import { AcceptAiSuggestionUseCase } from "./application/use-cases/accept-ai-suggestion.use-case";
import { CreateAiSuggestionUseCase } from "./application/use-cases/create-ai-suggestion.use-case";
import { GetAiSuggestionUseCase } from "./application/use-cases/get-ai-suggestion.use-case";
import { ListAiSuggestionsUseCase } from "./application/use-cases/list-ai-suggestions.use-case";
import { ModifyAiSuggestionUseCase } from "./application/use-cases/modify-ai-suggestion.use-case";
import { RejectAiSuggestionUseCase } from "./application/use-cases/reject-ai-suggestion.use-case";
import { NoopAiSuggestionTargetAccessPolicy } from "./infrastructure/noop-ai-suggestion-target-access-policy";
import { PrismaAiSuggestionRepository } from "./infrastructure/prisma-ai-suggestion.repository";
import { AiSuggestionController } from "./interfaces/http/ai-suggestion.controller";

/**
 * Correctifs audit Codex P1-003/P1-005 — `AiSuggestionFieldSchemaRegistry` (singleton du module,
 * exporté pour qu'un futur module producteur y enregistre son schéma une seule fois) et
 * `AI_SUGGESTION_TARGET_ACCESS_POLICY` (Noop par défaut ce sprint, remplaçable par un futur module
 * sans toucher à celui-ci) complètent le socle générique.
 */
@Module({
  imports: [SharedKernelModule, DatabaseModule, IdentityModule, MembershipsModule],
  controllers: [AiSuggestionController],
  providers: [
    PrismaAiSuggestionRepository,
    { provide: AI_SUGGESTION_REPOSITORY, useExisting: PrismaAiSuggestionRepository },
    { provide: AI_SUGGESTION_TARGET_ACCESS_POLICY, useClass: NoopAiSuggestionTargetAccessPolicy },
    AiSuggestionFieldSchemaRegistry,
    CreateAiSuggestionUseCase,
    ListAiSuggestionsUseCase,
    GetAiSuggestionUseCase,
    AcceptAiSuggestionUseCase,
    ModifyAiSuggestionUseCase,
    RejectAiSuggestionUseCase,
  ],
  exports: [CreateAiSuggestionUseCase, ListAiSuggestionsUseCase, GetAiSuggestionUseCase, AiSuggestionFieldSchemaRegistry],
})
export class AiSuggestionModule {}
