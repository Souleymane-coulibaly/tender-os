import { Controller, Get, HttpCode, HttpStatus, Param, UseFilters, UseGuards } from "@nestjs/common";
import { GetResponsePackageForPublicApiUseCase } from "../../../../response-package";
import { ApiKeyScope } from "../../../domain/enums";
import { assertApiKeyScope } from "../../../application/services/assert-api-key-scope";
import { ZodValidationPipe } from "../../../../../shared-kernel/zod-validation.pipe";
import { ApiKeyGuard } from "../api-key.guard";
import { ApiKeyThrottlerGuard } from "../api-key-throttler.guard";
import { CurrentApiKeyPrincipal } from "../current-api-key-principal.decorator";
import type { ApiKeyPrincipal } from "../../../application/use-cases/authenticate-api-key.use-case";
import { IntegrationsErrorFilter } from "../integrations-error.filter";
import { IdParamSchema } from "../schemas";

/** Mission §85/§86 — metadata uniquement (id/tender/lot/candidate/status/version), jamais le ZIP
 *  (téléchargement différé, voir rapport §"éléments différés"). */
@Controller("public/response-packages")
@UseFilters(IntegrationsErrorFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
export class PublicResponsePackagesController {
  constructor(private readonly getResponsePackageForPublicApiUseCase: GetResponsePackageForPublicApiUseCase) {}

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentApiKeyPrincipal() principal: ApiKeyPrincipal, @Param("id", new ZodValidationPipe(IdParamSchema)) responsePackageId: string) {
    assertApiKeyScope(principal, ApiKeyScope.ResponsePackagesRead);

    return this.getResponsePackageForPublicApiUseCase.execute({
      organizationId: principal.organizationId,
      responsePackageId,
      restrictToClientAccountIds: principal.allowedClientAccountIds.length > 0 ? principal.allowedClientAccountIds : undefined,
    });
  }
}
