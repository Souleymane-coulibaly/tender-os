import type { Document as DocumentRecord } from "@prisma/client";
import { Document } from "../domain/document.aggregate";
import { DocumentId } from "../domain/document-id.value-object";
import type { DocumentDomain } from "../domain/document-domain";
import type { DocumentOrigin } from "../domain/document-origin";
import type { DocumentStatus } from "../domain/document-status";

export type DocumentPersistenceData = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  origin: string;
  domain: string;
  category: string | null;
  status: string;
  currentVersionId: string | null;
  currentVersionNumber: number;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

export class DocumentPersistenceMapper {
  toDomain(record: DocumentRecord): Document {
    return Document.rehydrate({
      id: DocumentId.from(record.id),
      organizationId: record.organizationId,
      title: record.title,
      description: record.description ?? undefined,
      origin: record.origin as DocumentOrigin,
      domain: record.domain as DocumentDomain,
      category: record.category ?? undefined,
      status: record.status as DocumentStatus,
      currentVersionId: record.currentVersionId ?? undefined,
      currentVersionNumber: record.currentVersionNumber,
      createdByUserId: record.createdByUserId,
      updatedByUserId: record.updatedByUserId ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      archivedAt: record.archivedAt ?? undefined,
      deletedAt: record.deletedAt ?? undefined,
    });
  }

  toPersistence(document: Document): DocumentPersistenceData {
    return {
      id: document.id.value,
      organizationId: document.organizationId,
      title: document.title,
      description: document.description ?? null,
      origin: document.origin,
      domain: document.domain,
      category: document.category ?? null,
      status: document.status,
      currentVersionId: document.currentVersionId ?? null,
      currentVersionNumber: document.currentVersionNumber,
      createdByUserId: document.createdByUserId,
      updatedByUserId: document.updatedByUserId ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      archivedAt: document.archivedAt ?? null,
      deletedAt: document.deletedAt ?? null,
    };
  }
}
