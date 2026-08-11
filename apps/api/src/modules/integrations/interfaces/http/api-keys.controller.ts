import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { CreateApiKeyUseCase } from "../../application/use-cases/create-api-key.use-case";
import { ListApiKeysUseCase } from "../../application/use-cases/list-api-keys.use-case";
import { RevokeApiKeyUseCase } from "../../application/use-cases/revoke-api-key.use-case";
import { IntegrationsErrorFilter } from "./integrations-error.filter";
import { CreateApiKeyBodySchema, IdParamSchema, type CreateApiKeyBody } from "./schemas";

/** Mission §51/§52/§60 — écran "Clés API" : Create renvoie la clé complète UNE SEULE FOIS
 *  (`fullKey`), List/Get ne renvoient jamais que `keyPrefix` + métadonnées. */
@Controller("integrations/api-keys")
@UseFilters(IntegrationsErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ApiKeysController {
  constructor(
    private readonly createApiKeyUseCase: CreateApiKeyUseCase,
    private readonly listApiKeysUseCase: ListApiKeysUseCase,
    private readonly revokeApiKeyUseCase: RevokeApiKeyUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listApiKeysUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateApiKeyBodySchema)) body: CreateApiKeyBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createApiKeyUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      name: body.name,
      scopes: body.scopes,
      allowedClientAccountIds: body.allowedClientAccountIds,
      expiresAt: body.expiresAt,
      requestId: request.id,
    });

    // Mission §10/§11 — la SEULE réponse HTTP contenant la clé brute, jamais rejouée.
    return { fullKey: result.fullKey, apiKey: { id: result.apiKey.id, name: result.apiKey.name, keyPrefix: result.apiKey.keyPrefix, scopes: result.apiKey.scopes, allowedClientAccountIds: result.apiKey.allowedClientAccountIds } };
  }

  @Post(":id/revoke")
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) apiKeyId: string,
    @Req() request: RequestWithId,
  ) {
    await this.revokeApiKeyUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, apiKeyId, requestId: request.id });
    return { revoked: true };
  }
}
