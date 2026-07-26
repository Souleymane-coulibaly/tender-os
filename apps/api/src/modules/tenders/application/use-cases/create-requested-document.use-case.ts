import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { RequestedDocument } from "../../domain/requested-document.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toRequestedDocumentSummary, type RequestedDocumentSummary } from "../dtos";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type CreateRequestedDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorRole: string;
  name: string;
  category?: string | undefined;
  documentType?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  expirationDate?: string | undefined;
  displayOrder?: number | undefined;
}>;

@Injectable()
export class CreateRequestedDocumentUseCase {
  constructor(
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateRequestedDocumentCommand): Promise<RequestedDocumentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

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
      occurredAt: this.clock.now(),
    });

    await this.documentRepository.save(document);

    return toRequestedDocumentSummary(document);
  }
}
