import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { parseDocumentDomain } from "../../domain/document-domain";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";

export type UpdateDocumentMetadataCommand = Readonly<{
  organizationId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  domain?: string | undefined;
  category?: string | undefined;
  requestId?: string | undefined;
}>;

@Injectable()
export class UpdateDocumentMetadataUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateDocumentMetadataCommand): Promise<DocumentSummary> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.Update);

    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    document.updateMetadata(
      {
        title: command.title,
        description: command.description,
        domain: command.domain ? parseDocumentDomain(command.domain) : undefined,
        category: command.category,
      },
      command.actorId,
      this.clock.now(),
    );

    await this.documentRepository.save(document);

    const updatedFields = (["title", "description", "domain", "category"] as const).filter(
      (field) => command[field] !== undefined,
    );

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document.metadata_updated",
      resourceType: "document",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { updatedFields },
    });

    const currentVersion = document.currentVersionId
      ? await this.versionRepository.findById({
          organizationId: command.organizationId,
          documentId: command.documentId,
          versionId: document.currentVersionId,
        })
      : null;

    return toDocumentSummary(document, currentVersion ?? undefined);
  }
}
