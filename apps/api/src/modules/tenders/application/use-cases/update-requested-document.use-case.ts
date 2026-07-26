import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { RequestedDocumentNotFoundError } from "../../domain/errors";
import type { RequestedDocumentStatus } from "../../domain/requested-document.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toRequestedDocumentSummary, type RequestedDocumentSummary } from "../dtos";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

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
  actorRole: string;
  name?: string | undefined;
  category?: string | undefined;
  documentType?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  expirationDate?: string | undefined;
  documentRef?: string | undefined;
  displayOrder?: number | undefined;
}>;

@Injectable()
export class UpdateRequestedDocumentUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateRequestedDocumentCommand): Promise<RequestedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

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
  actorRole: string;
  status: RequestedDocumentStatus;
}>;

@Injectable()
export class ChangeRequestedDocumentStatusUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeRequestedDocumentStatusCommand): Promise<RequestedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

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
  actorRole: string;
}>;

@Injectable()
export class DeleteRequestedDocumentUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
  ) {}

  async execute(command: DeleteRequestedDocumentCommand): Promise<void> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

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
