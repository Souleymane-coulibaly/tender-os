import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import {
  GenerateDc1FormFillUseCase,
  GenerateDc4FormFillUseCase,
  GetDc1FormFillReadinessUseCase,
  GetDc4FormFillReadinessUseCase,
} from "../../application/use-cases/official-form-fill.use-cases";
import { AdministrativeDossierErrorFilter } from "./administrative-dossier-error.filter";
import { IdParamSchema } from "./schemas";

/**
 * V2 Sprint 11 — préremplissage des formulaires officiels RÉELS (DC1/DC4, gabarit DOCX
 * gouvernemental via le moteur Sprint 10), distinct des routes `PrepareOfficialFormUseCase`/
 * `GenerateOfficialFormUseCase` (Sprint 8C.1 — Annexe TenderOS complémentaire, moteur IR séparé,
 * routes déjà exposées ailleurs pour DC4 uniquement). Les routes `readiness` sont volontairement
 * SANS effet de bord (mission §35 "voir les données disponibles/manquantes sans jamais générer") ;
 * seule `POST .../generate` crée un `GeneratedDocument`, jamais appelée automatiquement par un
 * autre flux (mission §5/§6 "la génération reste facultative").
 */
@Controller()
@UseFilters(AdministrativeDossierErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AdministrativeDossierFormFillController {
  constructor(
    private readonly getDc1ReadinessUseCase: GetDc1FormFillReadinessUseCase,
    private readonly generateDc1UseCase: GenerateDc1FormFillUseCase,
    private readonly getDc4ReadinessUseCase: GetDc4FormFillReadinessUseCase,
    private readonly generateDc4UseCase: GenerateDc4FormFillUseCase,
  ) {}

  @Get("tenders/:tenderId/official-forms/dc1/readiness")
  async dc1Readiness(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getDc1ReadinessUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/official-forms/dc1/generate")
  @HttpCode(HttpStatus.CREATED)
  async generateDc1(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    return this.generateDc1UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, requestId: request.id });
  }

  @Get("subcontractor-declarations/:id/official-forms/dc4/readiness")
  async dc4Readiness(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string) {
    return this.getDc4ReadinessUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subcontractorDeclarationId });
  }

  @Post("subcontractor-declarations/:id/official-forms/dc4/generate")
  @HttpCode(HttpStatus.CREATED)
  async generateDc4(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string,
    @Req() request: RequestWithId,
  ) {
    return this.generateDc4UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subcontractorDeclarationId, requestId: request.id });
  }
}
