import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { RequestedDocumentNotFoundError } from "../../domain/errors";
import type { RequestedDocumentStatus } from "../../domain/requested-document.entity";
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

async function loadDocument(
  repository: RequestedDocumentRepository,
  input: { organizationId: string; tenderId: string; documentId: string },
) {
  const document = await repository.findById(input);
  if (!document) {
    throw new RequestedDocumentNotFoundError();
  }
  return document;
}

export type UpdateRequestedDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  name?: string | undefined;
  category?: string | undefined;
  documentType?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  expirationDate?: string | undefined;
  documentRef?: string | undefined;
  displayOrder?: number | undefined;
  isEliminatory?: boolean | undefined;
  lotId?: string | undefined;
  requestedFormat?: string | undefined;
  signatureRequired?: boolean | undefined;
  buyerProvidedTemplate?: boolean | undefined;
}>;

@Injectable()
export class UpdateRequestedDocumentUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateRequestedDocumentCommand): Promise<RequestedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    await assertLotBelongsToTender(this.lotRepository, command);

    const document = await loadDocument(this.documentRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      documentId: command.documentId,
    });

    document.update(
      {
        name: command.name,
        category: command.category,
        documentType: command.documentType,
        required: command.required,
        description: command.description,
        expirationDate: command.expirationDate ? new Date(command.expirationDate) : undefined,
        documentId: command.documentRef,
        isEliminatory: command.isEliminatory,
        lotId: command.lotId,
        requestedFormat: command.requestedFormat,
        signatureRequired: command.signatureRequired,
        buyerProvidedTemplate: command.buyerProvidedTemplate,
      },
      this.clock.now(),
    );

    await this.documentRepository.save(document);

    return toRequestedDocumentSummary(document);
  }
}

export type ChangeRequestedDocumentStatusCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  status: RequestedDocumentStatus;
}>;

@Injectable()
export class ChangeRequestedDocumentStatusUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ChangeRequestedDocumentStatusCommand): Promise<RequestedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const document = await loadDocument(this.documentRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      documentId: command.documentId,
    });

    document.changeStatus(command.status, this.clock.now());

    await this.documentRepository.save(document);

    return toRequestedDocumentSummary(document);
  }
}

export type DeleteRequestedDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class DeleteRequestedDocumentUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: DeleteRequestedDocumentCommand): Promise<void> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    await loadDocument(this.documentRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      documentId: command.documentId,
    });

    await this.documentRepository.delete({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      documentId: command.documentId,
    });
  }
}
