import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";

export type RestoreDocumentCommand = Readonly<{
  organizationId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class RestoreDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RestoreDocumentCommand): Promise<DocumentSummary> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.Restore);

    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    document.restore(this.clock.now());
    await this.documentRepository.save(document);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document.restored",
      resourceType: "document",
      resourceId: command.documentId,
      requestId: command.requestId,
    });

    return toDocumentSummary(document);
  }
}
