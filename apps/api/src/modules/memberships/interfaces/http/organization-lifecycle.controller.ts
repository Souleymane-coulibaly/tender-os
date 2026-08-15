import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { GetOrganizationUseCase, type OrganizationSummary } from "../../../organizations";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CreateOrganizationWithOwnerUseCase } from "../../application/use-cases/create-organization-with-owner.use-case";
import { DeleteOrganizationAsOwnerUseCase } from "../../application/use-cases/delete-organization-as-owner.use-case";
import { UpdateOrganizationProfileUseCase } from "../../application/use-cases/update-organization-profile.use-case";
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

/**
 * Reprend exactement la forme de `UpdateOrganizationBodySchema` (module Organizations, supprimé
 * avec l'ancien `OrganizationsController` vulnérable — voir plus bas) — dupliquée ici pour la
 * même raison que `CreateOrganizationBodySchema` ci-dessus (frontière de module).
 */
const UpdateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
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
    defaultTimezone: z.string().trim().min(1).max(80).optional(),
    settings: settingsSchema.optional(),
  })
  .strict();

type UpdateOrganizationBody = z.infer<typeof UpdateOrganizationBodySchema>;

type OrganizationResponse = Readonly<OrganizationSummary>;

function presentOrganization(organization: OrganizationSummary): OrganizationResponse {
  return { ...organization };
}

/**
 * Porte les routes `/organizations` qui nécessitent Memberships en plus d'Organizations
 * (création avec OWNER automatique, suppression réservée à l'OWNER — bible/03-domain/
 * business-rules.md BR-ORG-002 — et désormais `GET`/`PATCH /organizations/me`). Vit dans
 * Memberships (jamais dans Organizations, qui ne doit pas dépendre de Memberships en retour) —
 * voir organizations.module.ts et create-organization-with-owner.use-case.ts pour le détail.
 *
 * V2 Sprint 24 (onboarding, correctif sécurité IDOR) — l'ancien `OrganizationsController`
 * (`GET`/`PATCH /organizations/:id`, module Organizations) exposait ces routes avec pour seule
 * garde `AuthenticatedGuard` (aucune vérification de Membership) : n'importe quel utilisateur
 * authentifié pouvait lire/modifier n'importe quelle organisation en devinant son UUID.
 * Supprimé. `GET`/`PATCH /organizations/me` ci-dessous dérivent TOUJOURS l'organisation cible du
 * `MembershipContext` résolu par `OrganizationMembershipGuard` (jamais un `:id` fourni par le
 * client) ; `PATCH` exige en plus `organization:profile:update` (OWNER/ORGANIZATION_ADMIN).
 */
@Controller("organizations")
@UseFilters(MembershipsErrorFilter)
export class OrganizationLifecycleController {
  constructor(
    private readonly createOrganizationWithOwnerUseCase: CreateOrganizationWithOwnerUseCase,
    private readonly deleteOrganizationAsOwnerUseCase: DeleteOrganizationAsOwnerUseCase,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    private readonly updateOrganizationProfileUseCase: UpdateOrganizationProfileUseCase,
  ) {}

  @Get("me")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
  async getMine(@CurrentMembershipContext() membershipContext: MembershipContext): Promise<OrganizationResponse> {
    const result = await this.getOrganizationUseCase.execute({ id: membershipContext.organizationId });

    return presentOrganization(result);
  }

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
  async updateMine(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Body(new ZodValidationPipe(UpdateOrganizationBodySchema)) body: UpdateOrganizationBody,
    @Req() request: RequestWithId,
  ): Promise<OrganizationResponse> {
    const result = await this.updateOrganizationProfileUseCase.execute({
      organizationId: membershipContext.organizationId,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      ...body,
      requestId: request.id,
    });

    return presentOrganization(result);
  }

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
