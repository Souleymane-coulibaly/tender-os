import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { GetDocumentUseCase } from "../../../documents";
import { DuplicateDocumentClientAccountAssociationError } from "../../domain/errors";
import type { DocumentClientAccountAssociationRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY,
  type DocumentClientAccountAssociationRepository,
} from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";
import { verifyAttachableDocument } from "../services/verify-attachable-document";

export type AttachDocumentToClientAccountCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  documentId: string;
  category: string;
  issuedAt?: Date | undefined;
  expiresAt?: Date | undefined;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class ListClientAccountDocumentAssociationsUseCase {
  constructor(
    @Inject(DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY) private readonly repository: DocumentClientAccountAssociationRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<DocumentClientAccountAssociationRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}

@Injectable()
export class AttachDocumentToClientAccountUseCase {
  constructor(
    @Inject(DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY) private readonly repository: DocumentClientAccountAssociationRepository,
    private readonly accessService: CompanyProfileAccessService,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: AttachDocumentToClientAccountCommand): Promise<DocumentClientAccountAssociationRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyProfile });
    const { documentId } = await verifyAttachableDocument(this.getDocumentUseCase, command);

    const existing = await this.repository.list({ organizationId: command.organizationId, clientAccountId: command.clientAccountId });
    if (existing.some((association) => association.documentId === documentId)) {
      throw new DuplicateDocumentClientAccountAssociationError();
    }

    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      documentId,
      clientAccountId: command.clientAccountId,
      category: command.category,
      issuedAt: command.issuedAt ?? null,
      expiresAt: command.expiresAt ?? null,
      createdByUserId: command.actorId,
    });
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.document_attached",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { documentId, category: command.category },
    });
    return created;
  }
}
