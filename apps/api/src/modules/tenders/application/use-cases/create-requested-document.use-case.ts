import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { RequestedDocument } from "../../domain/requested-document.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toRequestedDocumentSummary, type RequestedDocumentSummary } from "../dtos";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertLotBelongsToTender, assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type CreateRequestedDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  name: string;
  category?: string | undefined;
  documentType?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  expirationDate?: string | undefined;
  displayOrder?: number | undefined;
  isEliminatory?: boolean | undefined;
  lotId?: string | undefined;
  requestedFormat?: string | undefined;
  signatureRequired?: boolean | undefined;
  buyerProvidedTemplate?: boolean | undefined;
}>;

@Injectable()
export class CreateRequestedDocumentUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateRequestedDocumentCommand): Promise<RequestedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    await assertLotBelongsToTender(this.lotRepository, command);

    const document = RequestedDocument.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      name: command.name,
      category: command.category,
      documentType: command.documentType,
      required: command.required,
      description: command.description,
      expirationDate: command.expirationDate ? new Date(command.expirationDate) : undefined,
      displayOrder: command.displayOrder,
      isEliminatory: command.isEliminatory,
      lotId: command.lotId,
      requestedFormat: command.requestedFormat,
      signatureRequired: command.signatureRequired,
      buyerProvidedTemplate: command.buyerProvidedTemplate,
      occurredAt: this.clock.now(),
    });

    await this.documentRepository.save(document);

    return toRequestedDocumentSummary(document);
  }
}
