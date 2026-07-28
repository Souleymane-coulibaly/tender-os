import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import type { OrganizationSummary } from "../../../organizations";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CreateOrganizationWithOwnerUseCase } from "../../application/use-cases/create-organization-with-owner.use-case";
import { DeleteOrganizationAsOwnerUseCase } from "../../application/use-cases/delete-organization-as-owner.use-case";
import { CurrentMembershipContext } from "./current-membership-context.decorator";
import { MembershipsErrorFilter } from "./memberships-error.filter";
import type { MembershipContext } from "./organization-membership.guard";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import { OrganizationIdParamSchema } from "./schemas";

const settingsSchema = z.record(z.string(), z.unknown());

/**
 * Reprend exactement la forme de CreateOrganizationBodySchema (module Organizations) — dupliquée
 * ici plutôt que réutilisée, car un schéma de validation HTTP appartient à la couche
 * interfaces/http de CE contrôleur (skills/platform-foundation/ARCHITECTURE_RULES.md §35 —
 * jamais d'import profond dans les détails privés d'un autre module). `CreateOrganizationCommand`
 * (organizations/index.ts) reste l'unique source de vérité pour la forme de la commande elle-même.
 */
const CreateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(240).optional(),
    registrationNumber: z.string().trim().min(1).max(100).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    defaultTimezone: z.string().trim().min(1).max(80),
    settings: settingsSchema.optional(),
  })
  .strict();

type CreateOrganizationBody = z.infer<typeof CreateOrganizationBodySchema>;

type OrganizationResponse = Readonly<OrganizationSummary>;

function presentOrganization(organization: OrganizationSummary): OrganizationResponse {
  return { ...organization };
}

/**
 * Porte les deux seules routes `/organizations` qui nécessitent Memberships en plus
 * d'Organizations (création avec OWNER automatique, suppression réservée à l'OWNER —
 * bible/03-domain/business-rules.md BR-ORG-002). Vit dans Memberships (jamais dans
 * Organizations, qui ne doit pas dépendre de Memberships en retour) — voir
 * organizations.module.ts et create-organization-with-owner.use-case.ts pour le détail.
 * Les routes `GET`/`PATCH /organizations/:id` restent dans OrganizationsController
 * (aucun besoin de contexte de Membership).
 */
@Controller("organizations")
@UseFilters(MembershipsErrorFilter)
export class OrganizationLifecycleController {
  constructor(
    private readonly createOrganizationWithOwnerUseCase: CreateOrganizationWithOwnerUseCase,
    private readonly deleteOrganizationAsOwnerUseCase: DeleteOrganizationAsOwnerUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedGuard)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(CreateOrganizationBodySchema)) body: CreateOrganizationBody,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrganizationResponse> {
    const result = await this.createOrganizationWithOwnerUseCase.execute({
      ...body,
      actorId: actor.userId,
      requestId: request.id,
    });

    response.setHeader("Location", `/api/v1/organizations/${result.id}`);

    return presentOrganization(result);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ): Promise<void> {
    // Le header X-Organization-Id (résolu par le guard) doit correspondre à l'organisation
    // ciblée par l'URL — même motif que le guard lui-même : ne jamais révéler qu'une
    // organisation existe à un acteur qui n'en est pas membre (404, pas 403).
    if (membershipContext.organizationId !== id) {
      throw new NotFoundException({
        error: { code: "ORGANIZATION_ACCESS_DENIED", message: "Organization not found or not accessible." },
      });
    }

    await this.deleteOrganizationAsOwnerUseCase.execute({
      organizationId: id,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      requestId: request.id,
    });
  }
}
