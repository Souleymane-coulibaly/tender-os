import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ListPageGuideStatesUseCase } from "../../application/use-cases/list-page-guide-states.use-case";
import { RecordPageGuideActionUseCase } from "../../application/use-cases/record-page-guide-action.use-case";
import { AuthenticatedGuard, type AuthenticatedActor } from "./authenticated.guard";
import { CurrentActor } from "./current-actor.decorator";
import { IdentityErrorFilter } from "./identity-error.filter";
import {
  presentPageGuideState,
  presentPageGuideStates,
  type PageGuideStateListResponse,
  type PageGuideStateResponse,
} from "./presenters";
import { PageGuideKeyParamSchema, RecordPageGuideActionBodySchema, type RecordPageGuideActionBody } from "./schemas";

/**
 * TENDEROS-2.1 (guides de page) — contrôleur frère de `AuthController`, sous le même préfixe
 * `auth/me` que `me/tour-state` et avec la même authentification : user-scoped, jamais de contexte
 * organisation. L'utilisateur ciblé est TOUJOURS l'acteur authentifié (jamais un identifiant issu
 * du chemin, du corps ou d'un en-tête). Le garde s'exécute avant les pipes : une requête non
 * authentifiée reçoit 401 avant toute validation.
 */
@Controller("auth/me/page-guides")
@UseFilters(IdentityErrorFilter)
@UseGuards(AuthenticatedGuard)
export class PageGuidesController {
  constructor(
    private readonly listPageGuideStatesUseCase: ListPageGuideStatesUseCase,
    private readonly recordPageGuideActionUseCase: RecordPageGuideActionUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentActor() actor: AuthenticatedActor): Promise<PageGuideStateListResponse> {
    const result = await this.listPageGuideStatesUseCase.execute({ userId: actor.userId });

    return presentPageGuideStates(result);
  }

  @Post(":guideKey")
  @HttpCode(HttpStatus.OK)
  async record(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("guideKey", new ZodValidationPipe(PageGuideKeyParamSchema)) guideKey: string,
    @Body(new ZodValidationPipe(RecordPageGuideActionBodySchema)) body: RecordPageGuideActionBody,
  ): Promise<PageGuideStateResponse> {
    const result = await this.recordPageGuideActionUseCase.execute({ userId: actor.userId, guideKey, action: body.action });

    return presentPageGuideState(result);
  }
}
