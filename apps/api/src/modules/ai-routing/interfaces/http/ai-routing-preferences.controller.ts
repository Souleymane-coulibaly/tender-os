import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { GetAiModelPreferencesUseCase, toAiModelPreferenceSummary } from "../../application/use-cases/get-ai-model-preferences.use-case";
import { ResetAiModelPreferenceUseCase } from "../../application/use-cases/reset-ai-model-preference.use-case";
import { SetAiModelPreferenceUseCase } from "../../application/use-cases/set-ai-model-preference.use-case";
import { AiRoutingErrorFilter } from "./ai-routing-error.filter";
import { SetPreferenceBodySchema, TaskTypeParamSchema, type SetPreferenceBody } from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4, mission §16/§18 — préférences de modèle IA STRICTEMENT
 * personnelles (jamais un paramètre `userId` fourni par le client, toujours `actor.userId` résolu
 * côté serveur — mission §38 isolation). Distinct de `/ai-benchmark/routing-policies`
 * (configuration org-admin, inchangée) : ici, chaque utilisateur ne peut lire/modifier que SES
 * PROPRES préférences, jamais celles d'un autre membre de l'organisation.
 */
@Controller("ai-routing/preferences")
@UseFilters(AiRoutingErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AiRoutingPreferencesController {
  constructor(
    private readonly getAiModelPreferencesUseCase: GetAiModelPreferencesUseCase,
    private readonly setAiModelPreferenceUseCase: SetAiModelPreferenceUseCase,
    private readonly resetAiModelPreferenceUseCase: ResetAiModelPreferenceUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext) {
    const views = await this.getAiModelPreferencesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role });
    return { items: views.map(toAiModelPreferenceSummary) };
  }

  @Put(":taskType")
  @HttpCode(HttpStatus.OK)
  async set(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("taskType", new ZodValidationPipe(TaskTypeParamSchema)) taskType: string,
    @Body(new ZodValidationPipe(SetPreferenceBodySchema)) body: SetPreferenceBody,
  ) {
    await this.setAiModelPreferenceUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, taskType, modelOverride: body.modelOverride });
    return { updated: true };
  }

  @Delete(":taskType")
  @HttpCode(HttpStatus.OK)
  async reset(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("taskType", new ZodValidationPipe(TaskTypeParamSchema)) taskType: string,
  ) {
    await this.resetAiModelPreferenceUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, taskType });
    return { reset: true };
  }
}
