import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../../../identity";
import { GetOrganizationUseCase } from "../../application/use-cases/get-organization.use-case";
import { UpdateOrganizationUseCase } from "../../application/use-cases/update-organization.use-case";
import { OrganizationsErrorFilter } from "./organizations-error.filter";
import { presentOrganization, type OrganizationResponse } from "./presenters";
import { OrganizationIdParamSchema, UpdateOrganizationBodySchema, type UpdateOrganizationBody } from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * `POST /organizations` (création + OWNER automatique) et `DELETE /organizations/:id`
 * (réservé à l'OWNER) vivent désormais dans OrganizationLifecycleController (module
 * Memberships) — Organizations ne doit pas dépendre de Memberships pour attribuer un rôle
 * (bible/03-domain/business-rules.md BR-ORG-002). Ce contrôleur ne porte plus que les routes
 * ne nécessitant aucun contexte de Membership.
 */
@Controller("organizations")
@UseFilters(OrganizationsErrorFilter)
@UseGuards(AuthenticatedGuard)
export class OrganizationsController {
  constructor(
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    private readonly updateOrganizationUseCase: UpdateOrganizationUseCase,
  ) {}

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async get(
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
  ): Promise<OrganizationResponse> {
    const result = await this.getOrganizationUseCase.execute({ id });

    return presentOrganization(result);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async update(
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateOrganizationBodySchema)) body: UpdateOrganizationBody,
  ): Promise<OrganizationResponse> {
    const result = await this.updateOrganizationUseCase.execute({ id, ...body });

    return presentOrganization(result);
  }
}
