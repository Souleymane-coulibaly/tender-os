import { Controller, Get, HttpCode, HttpStatus, Param, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ListTenderDocumentsUseCase } from "../../application/use-cases/list-tender-documents.use-case";
import { DocumentsErrorFilter } from "./documents-error.filter";
import { presentDocument } from "./presenters";
import { IdParamSchema } from "./schemas";

/** Route imbriquée sous /tenders, portée par le module Documents (dépendance autorisée
 *  Documents → Tenders, jamais l'inverse — conception §D, §K). Contrôleur séparé de
 *  DocumentsController pour refléter le préfixe de route réel sans le coupler à /documents. */
@Controller("tenders/:tenderId/documents")
@UseFilters(DocumentsErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TenderDocumentsController {
  constructor(private readonly listTenderDocumentsUseCase: ListTenderDocumentsUseCase) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const documents = await this.listTenderDocumentsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return documents.map(presentDocument);
  }
}
