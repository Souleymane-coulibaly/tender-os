import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseFilters, UseGuards } from "@nestjs/common";
import { GetTenderForPublicApiUseCase, ListTendersForPublicApiUseCase, TenderNotFoundError, isTenderStatus } from "../../../../tenders";
import { ApiKeyScope } from "../../../domain/enums";
import { assertApiKeyClientAllowed, assertApiKeyScope } from "../../../application/services/assert-api-key-scope";
import { ZodValidationPipe } from "../../../../../shared-kernel/zod-validation.pipe";
import { ApiKeyGuard } from "../api-key.guard";
import { ApiKeyThrottlerGuard } from "../api-key-throttler.guard";
import { CurrentApiKeyPrincipal } from "../current-api-key-principal.decorator";
import type { ApiKeyPrincipal } from "../../../application/use-cases/authenticate-api-key.use-case";
import { IntegrationsErrorFilter } from "../integrations-error.filter";
import { IdParamSchema, PublicListTendersQuerySchema, type PublicListTendersQuery } from "../schemas";

/**
 * Mission §6/§7/§8/§9/§66-70/§135 SCÉNARIO B — Public API v1, versionnée sous `/api/v1/public`
 * (jamais les endpoints internes `/api/v1/tenders` réutilisés tels quels, mission §6 — voir
 * rapport Sprint 16 §"API versioning" pour la résolution du chevauchement de chemin avec
 * l'exemple littéral de la mission). Auth par ApiKeyGuard uniquement (jamais de session).
 */
@Controller("public/tenders")
@UseFilters(IntegrationsErrorFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
export class PublicTendersController {
  constructor(
    private readonly listTendersForPublicApiUseCase: ListTendersForPublicApiUseCase,
    private readonly getTenderForPublicApiUseCase: GetTenderForPublicApiUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentApiKeyPrincipal() principal: ApiKeyPrincipal, @Query(new ZodValidationPipe(PublicListTendersQuerySchema)) query: PublicListTendersQuery) {
    assertApiKeyScope(principal, ApiKeyScope.TendersRead);

    if (query.clientId) {
      assertApiKeyClientAllowed(principal, query.clientId, () => new TenderNotFoundError());
    }

    return this.listTendersForPublicApiUseCase.execute({
      organizationId: principal.organizationId,
      restrictToClientAccountIds: principal.allowedClientAccountIds.length > 0 ? principal.allowedClientAccountIds : undefined,
      status: query.status && isTenderStatus(query.status) ? query.status : undefined,
      clientAccountId: query.clientId,
      updatedSince: query.updatedSince,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentApiKeyPrincipal() principal: ApiKeyPrincipal, @Param("id", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    assertApiKeyScope(principal, ApiKeyScope.TendersRead);

    return this.getTenderForPublicApiUseCase.execute({
      organizationId: principal.organizationId,
      tenderId,
      restrictToClientAccountIds: principal.allowedClientAccountIds.length > 0 ? principal.allowedClientAccountIds : undefined,
    });
  }
}
