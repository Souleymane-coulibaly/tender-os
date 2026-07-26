import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthenticatedGuard } from "../../../identity";
import { CreateOrganizationUseCase } from "../../application/use-cases/create-organization.use-case";
import { DeleteOrganizationUseCase } from "../../application/use-cases/delete-organization.use-case";
import { GetOrganizationUseCase } from "../../application/use-cases/get-organization.use-case";
import { UpdateOrganizationUseCase } from "../../application/use-cases/update-organization.use-case";
import { OrganizationsErrorFilter } from "./organizations-error.filter";
import { presentOrganization, type OrganizationResponse } from "./presenters";
import {
  CreateOrganizationBodySchema,
  OrganizationIdParamSchema,
  UpdateOrganizationBodySchema,
  type CreateOrganizationBody,
  type UpdateOrganizationBody,
} from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

@Controller("organizations")
@UseFilters(OrganizationsErrorFilter)
@UseGuards(AuthenticatedGuard)
export class OrganizationsController {
  constructor(
    private readonly createOrganizationUseCase: CreateOrganizationUseCase,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    private readonly updateOrganizationUseCase: UpdateOrganizationUseCase,
    private readonly deleteOrganizationUseCase: DeleteOrganizationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateOrganizationBodySchema)) body: CreateOrganizationBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrganizationResponse> {
    const result = await this.createOrganizationUseCase.execute(body);

    response.setHeader("Location", `/api/v1/organizations/${result.id}`);

    return presentOrganization(result);
  }

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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
  ): Promise<void> {
    await this.deleteOrganizationUseCase.execute({ id });
  }
}
