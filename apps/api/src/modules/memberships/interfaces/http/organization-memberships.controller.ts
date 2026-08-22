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
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ChangeMembershipRoleUseCase } from "../../application/use-cases/change-membership-role.use-case";
import { CreateMembershipUseCase } from "../../application/use-cases/create-membership.use-case";
import { InviteMemberByEmailUseCase } from "../../application/use-cases/invite-member-by-email.use-case";
import { GetMembershipUseCase } from "../../application/use-cases/get-membership.use-case";
import { ListMyMembershipsUseCase } from "../../application/use-cases/list-my-memberships.use-case";
import { ListOrganizationMembersUseCase } from "../../application/use-cases/list-organization-members.use-case";
import { RemoveMembershipUseCase } from "../../application/use-cases/remove-membership.use-case";
import { SuspendMembershipUseCase } from "../../application/use-cases/suspend-membership.use-case";
import { TransferOrganizationOwnershipUseCase } from "../../application/use-cases/transfer-organization-ownership.use-case";
import { CurrentMembershipContext } from "./current-membership-context.decorator";
import { MembershipsErrorFilter } from "./memberships-error.filter";
import type { MembershipContext } from "./organization-membership.guard";
import { OrganizationMembershipGuard } from "./organization-membership.guard";
import {
  presentMembership,
  presentMyMembership,
  presentOrganizationMember,
  presentOwnershipTransfer,
  presentPage,
  type MembershipResponse,
  type OrganizationMemberResponse,
  type OwnershipTransferResponse,
  type PageResponse,
} from "./presenters";
import {
  ChangeMembershipRoleBodySchema,
  CreateMembershipBodySchema,
  InviteMemberByEmailBodySchema,
  ListMembershipsQuerySchema,
  MembershipIdParamSchema,
  TransferOwnershipBodySchema,
  type ChangeMembershipRoleBody,
  type CreateMembershipBody,
  type InviteMemberByEmailBody,
  type ListMembershipsQuery,
  type TransferOwnershipBody,
} from "./schemas";

@Controller("organization-memberships")
@UseFilters(MembershipsErrorFilter)
@UseGuards(AuthenticatedGuard)
export class OrganizationMembershipsController {
  constructor(
    private readonly createMembershipUseCase: CreateMembershipUseCase,
    private readonly inviteMemberByEmailUseCase: InviteMemberByEmailUseCase,
    private readonly getMembershipUseCase: GetMembershipUseCase,
    private readonly listOrganizationMembersUseCase: ListOrganizationMembersUseCase,
    private readonly listMyMembershipsUseCase: ListMyMembershipsUseCase,
    private readonly changeMembershipRoleUseCase: ChangeMembershipRoleUseCase,
    private readonly suspendMembershipUseCase: SuspendMembershipUseCase,
    private readonly removeMembershipUseCase: RemoveMembershipUseCase,
    private readonly transferOrganizationOwnershipUseCase: TransferOrganizationOwnershipUseCase,
  ) {}

  @Get("me")
  @HttpCode(HttpStatus.OK)
  async listMine(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(new ZodValidationPipe(ListMembershipsQuerySchema)) query: ListMembershipsQuery,
  ): Promise<PageResponse<ReturnType<typeof presentMyMembership>>> {
    const result = await this.listMyMembershipsUseCase.execute({
      userId: actor.userId,
      cursor: query.cursor,
      limit: query.limit,
    });

    return presentPage(result.items.map(presentMyMembership), result.nextCursor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OrganizationMembershipGuard)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Body(new ZodValidationPipe(CreateMembershipBodySchema)) body: CreateMembershipBody,
    @Req() request: RequestWithId,
  ): Promise<MembershipResponse> {
    const result = await this.createMembershipUseCase.execute({
      organizationId: membershipContext.organizationId,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      userId: body.userId,
      role: body.role,
      expiresAt: body.expiresAt,
      requestId: request.id,
    });

    return presentMembership(result);
  }

  /** Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — "inviter par email", jamais un
   *  second moteur : délègue entièrement à `InviteMemberByEmailUseCase` (résolution email -> compte
   *  existant, puis `CreateMembershipUseCase` tel quel — même permission, même seat-limit atomique,
   *  même audit). Route distincte de `POST /organization-memberships` (jamais un body à deux formes
   *  mutuellement exclusives sur une route déjà testée). */
  @Post("invite-by-email")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OrganizationMembershipGuard)
  async inviteByEmail(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Body(new ZodValidationPipe(InviteMemberByEmailBodySchema)) body: InviteMemberByEmailBody,
    @Req() request: RequestWithId,
  ): Promise<MembershipResponse> {
    const result = await this.inviteMemberByEmailUseCase.execute({
      organizationId: membershipContext.organizationId,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      email: body.email,
      role: body.role,
      expiresAt: body.expiresAt,
      requestId: request.id,
    });

    return presentMembership(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(OrganizationMembershipGuard)
  async list(
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Query(new ZodValidationPipe(ListMembershipsQuerySchema)) query: ListMembershipsQuery,
  ): Promise<PageResponse<OrganizationMemberResponse>> {
    const result = await this.listOrganizationMembersUseCase.execute({
      organizationId: membershipContext.organizationId,
      actorRole: membershipContext.role,
      cursor: query.cursor,
      limit: query.limit,
    });

    return presentPage(result.items.map(presentOrganizationMember), result.nextCursor);
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(OrganizationMembershipGuard)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Param("id", new ZodValidationPipe(MembershipIdParamSchema)) id: string,
  ): Promise<MembershipResponse> {
    const result = await this.getMembershipUseCase.execute({
      organizationId: membershipContext.organizationId,
      membershipId: id,
      actorId: actor.userId,
      actorRole: membershipContext.role,
    });

    return presentMembership(result);
  }

  @Patch(":id/role")
  @HttpCode(HttpStatus.OK)
  @UseGuards(OrganizationMembershipGuard)
  async changeRole(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Param("id", new ZodValidationPipe(MembershipIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(ChangeMembershipRoleBodySchema)) body: ChangeMembershipRoleBody,
    @Req() request: RequestWithId,
  ): Promise<MembershipResponse> {
    const result = await this.changeMembershipRoleUseCase.execute({
      organizationId: membershipContext.organizationId,
      membershipId: id,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      role: body.role,
      requestId: request.id,
    });

    return presentMembership(result);
  }

  @Post("transfer-ownership")
  @HttpCode(HttpStatus.OK)
  @UseGuards(OrganizationMembershipGuard)
  async transferOwnership(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Body(new ZodValidationPipe(TransferOwnershipBodySchema)) body: TransferOwnershipBody,
    @Req() request: RequestWithId,
  ): Promise<OwnershipTransferResponse> {
    const result = await this.transferOrganizationOwnershipUseCase.execute({
      organizationId: membershipContext.organizationId,
      actorId: actor.userId,
      newOwnerMembershipId: body.newOwnerMembershipId,
      requestId: request.id,
    });

    return presentOwnershipTransfer(result);
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @UseGuards(OrganizationMembershipGuard)
  async suspend(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Param("id", new ZodValidationPipe(MembershipIdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ): Promise<MembershipResponse> {
    const result = await this.suspendMembershipUseCase.execute({
      organizationId: membershipContext.organizationId,
      membershipId: id,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      requestId: request.id,
    });

    return presentMembership(result);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OrganizationMembershipGuard)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membershipContext: MembershipContext,
    @Param("id", new ZodValidationPipe(MembershipIdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.removeMembershipUseCase.execute({
      organizationId: membershipContext.organizationId,
      membershipId: id,
      actorId: actor.userId,
      actorRole: membershipContext.role,
      requestId: request.id,
    });
  }
}
