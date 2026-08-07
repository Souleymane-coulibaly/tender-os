import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { OutboxModule } from "../outbox";
import { DatabaseModule } from "../../shared-kernel/database.module";
import { SharedKernelModule } from "../../shared-kernel/shared-kernel.module";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { AI_SUGGESTION_REPOSITORY } from "./application/ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "./application/services/ai-suggestion-field-schema-registry";
import { AcceptAiSuggestionUseCase } from "./application/use-cases/accept-ai-suggestion.use-case";
import { CreateAiSuggestionUseCase } from "./application/use-cases/create-ai-suggestion.use-case";
import { GetAiSuggestionUseCase } from "./application/use-cases/get-ai-suggestion.use-case";
import { ListAiSuggestionsUseCase } from "./application/use-cases/list-ai-suggestions.use-case";
import { ModifyAiSuggestionUseCase } from "./application/use-cases/modify-ai-suggestion.use-case";
import { RejectAiSuggestionUseCase } from "./application/use-cases/reject-ai-suggestion.use-case";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaAiSuggestionRepository } from "./infrastructure/prisma-ai-suggestion.repository";
import { AiSuggestionController } from "./interfaces/http/ai-suggestion.controller";

/**
 * Correctifs audit Codex P1-003/P1-005 — `AiSuggestionFieldSchemaRegistry` (singleton du module,
 * exporté pour qu'un futur module producteur y enregistre son schéma une seule fois).
 *
 * V2 Sprint 4 — `AI_SUGGESTION_TARGET_ACCESS_POLICY` n'est PLUS fourni par défaut ici
 * (contrairement au Sprint 1) : chaque use case l'injecte désormais en `@Optional()` avec un
 * repli sur `DEFAULT_TARGET_ACCESS_POLICY` (Domain, aucune restriction). Cela permet à
 * `ai-suggestion-bridge` (`@Global()`) de rebinder ce token pour TOUTE l'application — y compris
 * les use cases déclarés ICI — sans jamais modifier ce module générique. Si ce module fournissait
 * encore lui-même une valeur par défaut, elle gagnerait systématiquement dans son propre
 * injecteur (résolution NestJS locale-d'abord), rendant le rebind global inopérant.
 */
@Module({
  imports: [SharedKernelModule, DatabaseModule, IdentityModule, MembershipsModule, OutboxModule],
  controllers: [AiSuggestionController],
  providers: [
    PrismaAiSuggestionRepository,
    { provide: AI_SUGGESTION_REPOSITORY, useExisting: PrismaAiSuggestionRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    AiSuggestionFieldSchemaRegistry,
    CreateAiSuggestionUseCase,
    ListAiSuggestionsUseCase,
    GetAiSuggestionUseCase,
    AcceptAiSuggestionUseCase,
    ModifyAiSuggestionUseCase,
    RejectAiSuggestionUseCase,
  ],
  // V2 Sprint 4 — Accept/Modify/Reject désormais exportés : `ai-suggestion-bridge` les appelle
  // pour transitionner le statut de la suggestion APRÈS avoir écrit la donnée métier réelle via
  // le use case public du module cible (jamais l'inverse, jamais de duplication de cette logique).
  // AI_SUGGESTION_REPOSITORY exporté en plus (audit Codex P1-001) — UNIQUEMENT pour que le bridge
  // réserve/libère le verrou de statut PENDING<->APPLYING autour de son écriture métier (voir
  // ApplyAiSuggestionUseCase) ; la logique de DÉCISION (accept/modify/reject) continue de passer
  // exclusivement par les use cases ci-dessus, jamais par un accès direct au repository.
  exports: [
    CreateAiSuggestionUseCase,
    ListAiSuggestionsUseCase,
    GetAiSuggestionUseCase,
    AcceptAiSuggestionUseCase,
    ModifyAiSuggestionUseCase,
    RejectAiSuggestionUseCase,
    AiSuggestionFieldSchemaRegistry,
    AI_SUGGESTION_REPOSITORY,
  ],
})
export class AiSuggestionModule {}
