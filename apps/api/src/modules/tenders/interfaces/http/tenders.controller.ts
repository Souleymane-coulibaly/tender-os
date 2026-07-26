import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ArchiveTenderUseCase } from "../../application/use-cases/archive-tender.use-case";
import { ChangeTenderStatusUseCase } from "../../application/use-cases/change-tender-status.use-case";
import { CreateTenderUseCase } from "../../application/use-cases/create-tender.use-case";
import { GetTenderUseCase } from "../../application/use-cases/get-tender.use-case";
import { GetTenderBoardUseCase } from "../../application/use-cases/get-tender-board.use-case";
import { GetTenderListViewUseCase } from "../../application/use-cases/get-tender-list-view.use-case";
import { GetTenderReadinessUseCase } from "../../application/use-cases/get-tender-readiness.use-case";
import { GetTenderStatisticsUseCase } from "../../application/use-cases/get-tender-statistics.use-case";
import { ListTenderStatusHistoryUseCase } from "../../application/use-cases/list-tender-status-history.use-case";
import { UpdateTenderUseCase } from "../../application/use-cases/update-tender.use-case";

import { CreateTenderLotUseCase } from "../../application/use-cases/create-tender-lot.use-case";
import { DeleteTenderLotUseCase, UpdateTenderLotUseCase } from "../../application/use-cases/update-tender-lot.use-case";
import { ListTenderLotsUseCase } from "../../application/use-cases/list-tender-lots.use-case";

import { CreateChecklistItemUseCase } from "../../application/use-cases/create-checklist-item.use-case";
import {
  ChangeChecklistItemStatusUseCase,
  UpdateChecklistItemUseCase,
} from "../../application/use-cases/update-checklist-item.use-case";
import { ListChecklistItemsUseCase } from "../../application/use-cases/list-checklist-items.use-case";

import { CreateAwardCriterionUseCase } from "../../application/use-cases/create-award-criterion.use-case";
import {
  DeleteAwardCriterionUseCase,
  UpdateAwardCriterionUseCase,
} from "../../application/use-cases/update-award-criterion.use-case";
import { ListAwardCriteriaUseCase } from "../../application/use-cases/list-award-criteria.use-case";

import { CreateRequestedDocumentUseCase } from "../../application/use-cases/create-requested-document.use-case";
import {
  ChangeRequestedDocumentStatusUseCase,
  DeleteRequestedDocumentUseCase,
  UpdateRequestedDocumentUseCase,
} from "../../application/use-cases/update-requested-document.use-case";
import { ListRequestedDocumentsUseCase } from "../../application/use-cases/list-requested-documents.use-case";

import { CreateMilestoneUseCase } from "../../application/use-cases/create-milestone.use-case";
import {
  DeleteMilestoneUseCase,
  MarkMilestoneDoneUseCase,
  UpdateMilestoneUseCase,
} from "../../application/use-cases/update-milestone.use-case";
import { ListMilestonesUseCase } from "../../application/use-cases/list-milestones.use-case";

import { CreateRiskUseCase } from "../../application/use-cases/create-risk.use-case";
import { ChangeRiskStatusUseCase, UpdateRiskUseCase } from "../../application/use-cases/update-risk.use-case";
import { ListRisksUseCase } from "../../application/use-cases/list-risks.use-case";

import { CreateAlertUseCase } from "../../application/use-cases/create-alert.use-case";
import { ResolveAlertUseCase } from "../../application/use-cases/resolve-alert.use-case";
import { ListAlertsUseCase } from "../../application/use-cases/list-alerts.use-case";

import {
  presentAlert,
  presentAwardCriterion,
  presentChecklistItem,
  presentMilestone,
  presentPage,
  presentReadiness,
  presentRequestedDocument,
  presentRisk,
  presentStatusHistoryEntry,
  presentTender,
  presentTenderBoard,
  presentTenderListItem,
  presentTenderLot,
  presentTenderStatistics,
} from "./presenters";
import { TendersErrorFilter } from "./tenders-error.filter";
import {
  ArchiveTenderBodySchema,
  ChangeChecklistItemStatusBodySchema,
  ChangeRequestedDocumentStatusBodySchema,
  ChangeRiskStatusBodySchema,
  ChangeTenderStatusBodySchema,
  CreateAlertBodySchema,
  CreateAwardCriterionBodySchema,
  CreateChecklistItemBodySchema,
  CreateMilestoneBodySchema,
  CreateRequestedDocumentBodySchema,
  CreateRiskBodySchema,
  CreateTenderBodySchema,
  CreateTenderLotBodySchema,
  IdParamSchema,
  ListTendersQuerySchema,
  TenderBoardQuerySchema,
  UpdateAwardCriterionBodySchema,
  UpdateChecklistItemBodySchema,
  UpdateMilestoneBodySchema,
  UpdateRequestedDocumentBodySchema,
  UpdateRiskBodySchema,
  UpdateTenderBodySchema,
  UpdateTenderLotBodySchema,
  type ArchiveTenderBody,
  type ChangeChecklistItemStatusBody,
  type ChangeRequestedDocumentStatusBody,
  type ChangeRiskStatusBody,
  type ChangeTenderStatusBody,
  type CreateAlertBody,
  type CreateAwardCriterionBody,
  type CreateChecklistItemBody,
  type CreateMilestoneBody,
  type CreateRequestedDocumentBody,
  type CreateRiskBody,
  type CreateTenderBody,
  type CreateTenderLotBody,
  type ListTendersQuery,
  type TenderBoardQuery,
  type UpdateAwardCriterionBody,
  type UpdateChecklistItemBody,
  type UpdateMilestoneBody,
  type UpdateRequestedDocumentBody,
  type UpdateRiskBody,
  type UpdateTenderBody,
  type UpdateTenderLotBody,
} from "./schemas";

@Controller("tenders")
@UseFilters(TendersErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TendersController {
  constructor(
    private readonly createTenderUseCase: CreateTenderUseCase,
    private readonly updateTenderUseCase: UpdateTenderUseCase,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getTenderBoardUseCase: GetTenderBoardUseCase,
    private readonly getTenderListViewUseCase: GetTenderListViewUseCase,
    private readonly getTenderStatisticsUseCase: GetTenderStatisticsUseCase,
    private readonly changeTenderStatusUseCase: ChangeTenderStatusUseCase,
    private readonly archiveTenderUseCase: ArchiveTenderUseCase,
    private readonly listTenderStatusHistoryUseCase: ListTenderStatusHistoryUseCase,
    private readonly getTenderReadinessUseCase: GetTenderReadinessUseCase,

    private readonly createTenderLotUseCase: CreateTenderLotUseCase,
    private readonly updateTenderLotUseCase: UpdateTenderLotUseCase,
    private readonly deleteTenderLotUseCase: DeleteTenderLotUseCase,
    private readonly listTenderLotsUseCase: ListTenderLotsUseCase,

    private readonly createChecklistItemUseCase: CreateChecklistItemUseCase,
    private readonly updateChecklistItemUseCase: UpdateChecklistItemUseCase,
    private readonly changeChecklistItemStatusUseCase: ChangeChecklistItemStatusUseCase,
    private readonly listChecklistItemsUseCase: ListChecklistItemsUseCase,

    private readonly createAwardCriterionUseCase: CreateAwardCriterionUseCase,
    private readonly updateAwardCriterionUseCase: UpdateAwardCriterionUseCase,
    private readonly deleteAwardCriterionUseCase: DeleteAwardCriterionUseCase,
    private readonly listAwardCriteriaUseCase: ListAwardCriteriaUseCase,

    private readonly createRequestedDocumentUseCase: CreateRequestedDocumentUseCase,
    private readonly updateRequestedDocumentUseCase: UpdateRequestedDocumentUseCase,
    private readonly changeRequestedDocumentStatusUseCase: ChangeRequestedDocumentStatusUseCase,
    private readonly deleteRequestedDocumentUseCase: DeleteRequestedDocumentUseCase,
    private readonly listRequestedDocumentsUseCase: ListRequestedDocumentsUseCase,

    private readonly createMilestoneUseCase: CreateMilestoneUseCase,
    private readonly updateMilestoneUseCase: UpdateMilestoneUseCase,
    private readonly markMilestoneDoneUseCase: MarkMilestoneDoneUseCase,
    private readonly deleteMilestoneUseCase: DeleteMilestoneUseCase,
    private readonly listMilestonesUseCase: ListMilestonesUseCase,

    private readonly createRiskUseCase: CreateRiskUseCase,
    private readonly updateRiskUseCase: UpdateRiskUseCase,
    private readonly changeRiskStatusUseCase: ChangeRiskStatusUseCase,
    private readonly listRisksUseCase: ListRisksUseCase,

    private readonly createAlertUseCase: CreateAlertUseCase,
    private readonly resolveAlertUseCase: ResolveAlertUseCase,
    private readonly listAlertsUseCase: ListAlertsUseCase,
  ) {}

  // ---- Tender ----

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateTenderBodySchema)) body: CreateTenderBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createTenderUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentTender(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListTendersQuerySchema)) query: ListTendersQuery,
  ) {
    // Vue Liste enrichie (mission Kanban & List Views §5) — additif par rapport au
    // TenderSummary de base, ListTendersUseCase reste disponible comme brique interne plus
    // légère (voir list-tenders.use-case.ts) si un futur appelant n'a pas besoin de l'enrichissement.
    const result = await this.getTenderListViewUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      ...query,
    });
    return presentPage(result.items.map(presentTenderListItem), result.nextCursor);
  }

  @Get("board")
  @HttpCode(HttpStatus.OK)
  async board(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(TenderBoardQuerySchema)) query: TenderBoardQuery,
  ) {
    const result = await this.getTenderBoardUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      ...query,
    });
    return presentTenderBoard(result);
  }

  @Get("stats")
  @HttpCode(HttpStatus.OK)
  async stats(@CurrentMembershipContext() membership: MembershipContext) {
    const result = await this.getTenderStatisticsUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
    });
    return presentTenderStatistics(result);
  }

  @Get(":tenderId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const result = await this.getTenderUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return presentTender(result);
  }

  @Patch(":tenderId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(UpdateTenderBodySchema)) body: UpdateTenderBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateTenderUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentTender(result);
  }

  @Post(":tenderId/status")
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(ChangeTenderStatusBodySchema)) body: ChangeTenderStatusBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.changeTenderStatusUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      status: body.status,
      reason: body.reason,
      requestId: request.id,
    });
    return presentTender(result);
  }

  @Post(":tenderId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(ArchiveTenderBodySchema)) body: ArchiveTenderBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.archiveTenderUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      reason: body.reason,
      requestId: request.id,
    });
    return presentTender(result);
  }

  @Get(":tenderId/history")
  @HttpCode(HttpStatus.OK)
  async history(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const entries = await this.listTenderStatusHistoryUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return entries.map(presentStatusHistoryEntry);
  }

  @Get(":tenderId/readiness")
  @HttpCode(HttpStatus.OK)
  async readiness(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const result = await this.getTenderReadinessUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return presentReadiness(result);
  }

  // ---- Lots ----

  @Post(":tenderId/lots")
  @HttpCode(HttpStatus.CREATED)
  async createLot(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateTenderLotBodySchema)) body: CreateTenderLotBody,
  ) {
    const result = await this.createTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      ...body,
    });
    return presentTenderLot(result);
  }

  @Get(":tenderId/lots")
  @HttpCode(HttpStatus.OK)
  async listLots(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const lots = await this.listTenderLotsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return lots.map(presentTenderLot);
  }

  @Patch(":tenderId/lots/:lotId")
  @HttpCode(HttpStatus.OK)
  async updateLot(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("lotId", new ZodValidationPipe(IdParamSchema)) lotId: string,
    @Body(new ZodValidationPipe(UpdateTenderLotBodySchema)) body: UpdateTenderLotBody,
  ) {
    const result = await this.updateTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      lotId,
      actorRole: membership.role,
      ...body,
    });
    return presentTenderLot(result);
  }

  @Delete(":tenderId/lots/:lotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLot(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("lotId", new ZodValidationPipe(IdParamSchema)) lotId: string,
  ) {
    await this.deleteTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      lotId,
      actorRole: membership.role,
    });
  }

  // ---- Checklist ----

  @Post(":tenderId/checklist")
  @HttpCode(HttpStatus.CREATED)
  async createChecklistItem(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateChecklistItemBodySchema)) body: CreateChecklistItemBody,
  ) {
    const result = await this.createChecklistItemUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      ...body,
    });
    return presentChecklistItem(result);
  }

  @Get(":tenderId/checklist")
  @HttpCode(HttpStatus.OK)
  async listChecklist(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const items = await this.listChecklistItemsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return items.map(presentChecklistItem);
  }

  @Patch(":tenderId/checklist/:itemId")
  @HttpCode(HttpStatus.OK)
  async updateChecklistItem(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Body(new ZodValidationPipe(UpdateChecklistItemBodySchema)) body: UpdateChecklistItemBody,
  ) {
    const result = await this.updateChecklistItemUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      itemId,
      actorRole: membership.role,
      ...body,
    });
    return presentChecklistItem(result);
  }

  @Post(":tenderId/checklist/:itemId/status")
  @HttpCode(HttpStatus.OK)
  async changeChecklistItemStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Body(new ZodValidationPipe(ChangeChecklistItemStatusBodySchema)) body: ChangeChecklistItemStatusBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.changeChecklistItemStatusUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      itemId,
      actorId: actor.userId,
      actorRole: membership.role,
      status: body.status,
      requestId: request.id,
    });
    return presentChecklistItem(result);
  }

  // ---- Award criteria ----

  @Post(":tenderId/criteria")
  @HttpCode(HttpStatus.CREATED)
  async createCriterion(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateAwardCriterionBodySchema)) body: CreateAwardCriterionBody,
  ) {
    const result = await this.createAwardCriterionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      ...body,
    });
    return presentAwardCriterion(result);
  }

  @Get(":tenderId/criteria")
  @HttpCode(HttpStatus.OK)
  async listCriteria(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const criteria = await this.listAwardCriteriaUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return criteria.map(presentAwardCriterion);
  }

  @Patch(":tenderId/criteria/:criterionId")
  @HttpCode(HttpStatus.OK)
  async updateCriterion(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("criterionId", new ZodValidationPipe(IdParamSchema)) criterionId: string,
    @Body(new ZodValidationPipe(UpdateAwardCriterionBodySchema)) body: UpdateAwardCriterionBody,
  ) {
    const result = await this.updateAwardCriterionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      criterionId,
      actorRole: membership.role,
      ...body,
    });
    return presentAwardCriterion(result);
  }

  @Delete(":tenderId/criteria/:criterionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCriterion(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("criterionId", new ZodValidationPipe(IdParamSchema)) criterionId: string,
  ) {
    await this.deleteAwardCriterionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      criterionId,
      actorRole: membership.role,
    });
  }

  // ---- Requested documents ----

  @Post(":tenderId/requested-documents")
  @HttpCode(HttpStatus.CREATED)
  async createRequestedDocument(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateRequestedDocumentBodySchema)) body: CreateRequestedDocumentBody,
  ) {
    const result = await this.createRequestedDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      ...body,
    });
    return presentRequestedDocument(result);
  }

  @Get(":tenderId/requested-documents")
  @HttpCode(HttpStatus.OK)
  async listRequestedDocuments(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const documents = await this.listRequestedDocumentsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return documents.map(presentRequestedDocument);
  }

  @Patch(":tenderId/requested-documents/:documentId")
  @HttpCode(HttpStatus.OK)
  async updateRequestedDocument(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(UpdateRequestedDocumentBodySchema)) body: UpdateRequestedDocumentBody,
  ) {
    const result = await this.updateRequestedDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorRole: membership.role,
      ...body,
    });
    return presentRequestedDocument(result);
  }

  @Post(":tenderId/requested-documents/:documentId/status")
  @HttpCode(HttpStatus.OK)
  async changeRequestedDocumentStatus(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(ChangeRequestedDocumentStatusBodySchema)) body: ChangeRequestedDocumentStatusBody,
  ) {
    const result = await this.changeRequestedDocumentStatusUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorRole: membership.role,
      status: body.status,
    });
    return presentRequestedDocument(result);
  }

  @Delete(":tenderId/requested-documents/:documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRequestedDocument(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    await this.deleteRequestedDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorRole: membership.role,
    });
  }

  // ---- Milestones ----

  @Post(":tenderId/milestones")
  @HttpCode(HttpStatus.CREATED)
  async createMilestone(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateMilestoneBodySchema)) body: CreateMilestoneBody,
  ) {
    const result = await this.createMilestoneUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      ...body,
    });
    return presentMilestone(result);
  }

  @Get(":tenderId/milestones")
  @HttpCode(HttpStatus.OK)
  async listMilestones(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const milestones = await this.listMilestonesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return milestones.map(presentMilestone);
  }

  @Patch(":tenderId/milestones/:milestoneId")
  @HttpCode(HttpStatus.OK)
  async updateMilestone(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("milestoneId", new ZodValidationPipe(IdParamSchema)) milestoneId: string,
    @Body(new ZodValidationPipe(UpdateMilestoneBodySchema)) body: UpdateMilestoneBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateMilestoneUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      milestoneId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentMilestone(result);
  }

  @Post(":tenderId/milestones/:milestoneId/done")
  @HttpCode(HttpStatus.OK)
  async markMilestoneDone(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("milestoneId", new ZodValidationPipe(IdParamSchema)) milestoneId: string,
  ) {
    const result = await this.markMilestoneDoneUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      milestoneId,
      actorRole: membership.role,
    });
    return presentMilestone(result);
  }

  @Delete(":tenderId/milestones/:milestoneId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMilestone(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("milestoneId", new ZodValidationPipe(IdParamSchema)) milestoneId: string,
  ) {
    await this.deleteMilestoneUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      milestoneId,
      actorRole: membership.role,
    });
  }

  // ---- Risks ----

  @Post(":tenderId/risks")
  @HttpCode(HttpStatus.CREATED)
  async createRisk(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateRiskBodySchema)) body: CreateRiskBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createRiskUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentRisk(result);
  }

  @Get(":tenderId/risks")
  @HttpCode(HttpStatus.OK)
  async listRisks(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const risks = await this.listRisksUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return risks.map(presentRisk);
  }

  @Patch(":tenderId/risks/:riskId")
  @HttpCode(HttpStatus.OK)
  async updateRisk(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("riskId", new ZodValidationPipe(IdParamSchema)) riskId: string,
    @Body(new ZodValidationPipe(UpdateRiskBodySchema)) body: UpdateRiskBody,
  ) {
    const result = await this.updateRiskUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      riskId,
      actorRole: membership.role,
      ...body,
    });
    return presentRisk(result);
  }

  @Post(":tenderId/risks/:riskId/status")
  @HttpCode(HttpStatus.OK)
  async changeRiskStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("riskId", new ZodValidationPipe(IdParamSchema)) riskId: string,
    @Body(new ZodValidationPipe(ChangeRiskStatusBodySchema)) body: ChangeRiskStatusBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.changeRiskStatusUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      riskId,
      actorId: actor.userId,
      actorRole: membership.role,
      status: body.status,
      requestId: request.id,
    });
    return presentRisk(result);
  }

  // ---- Alerts ----

  @Post(":tenderId/alerts")
  @HttpCode(HttpStatus.CREATED)
  async createAlert(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateAlertBodySchema)) body: CreateAlertBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createAlertUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentAlert(result);
  }

  @Get(":tenderId/alerts")
  @HttpCode(HttpStatus.OK)
  async listAlerts(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const alerts = await this.listAlertsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return alerts.map(presentAlert);
  }

  @Post(":tenderId/alerts/:alertId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveAlert(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("alertId", new ZodValidationPipe(IdParamSchema)) alertId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.resolveAlertUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      alertId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAlert(result);
  }
}
