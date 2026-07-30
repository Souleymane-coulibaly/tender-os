import { Readable } from "node:stream";
import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AuditLogWriter, DocumentAuditLogEntry } from "../application/ports/audit-log-writer";
import type {
  DocumentTenderAssociationRepository,
} from "../application/ports/document-tender-association.repository";
import type { DocumentVersionRepository } from "../application/ports/document-version.repository";
import type { DocumentPage, DocumentRepository } from "../application/ports/document.repository";
import type { StorageProvider } from "../application/ports/storage-provider";
import { ConcurrentVersionCreationError } from "../domain/errors";
import type { DocumentTenderAssociation } from "../domain/document-tender-association.entity";
import type { DocumentVersion } from "../domain/document-version.entity";
import type { Document } from "../domain/document.aggregate";

export const FIXED_NOW = new Date("2026-07-27T10:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: DocumentAuditLogEntry[] = [];
  async record(entry: DocumentAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, Document>();

  async seed(document: Document): Promise<void> {
    this.documents.set(document.id.value, document);
  }

  async findById(input: { organizationId: string; documentId: string }): Promise<Document | null> {
    const document = this.documents.get(input.documentId);
    if (!document || document.organizationId !== input.organizationId || document.deletedAt !== undefined) {
      return null;
    }
    return document;
  }

  async list(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
    status?: string | undefined;
    origin?: string | undefined;
    domain?: string | undefined;
    createdByUserId?: string | undefined;
    search?: string | undefined;
  }): Promise<DocumentPage> {
    let items = [...this.documents.values()].filter(
      (document) => document.organizationId === input.organizationId && document.deletedAt === undefined,
    );

    if (input.status) items = items.filter((document) => document.status === input.status);
    if (input.origin) items = items.filter((document) => document.origin === input.origin);
    if (input.domain) items = items.filter((document) => document.domain === input.domain);
    if (input.createdByUserId) items = items.filter((document) => document.createdByUserId === input.createdByUserId);
    if (input.search) {
      const needle = input.search.toLowerCase();
      items = items.filter((document) => document.title.toLowerCase().includes(needle));
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const startIndex = input.cursor ? items.findIndex((document) => document.id.value === input.cursor) + 1 : 0;
    const page = items.slice(startIndex, startIndex + input.limit);
    const hasNextPage = startIndex + input.limit < items.length;

    return { items: page, nextCursor: hasNextPage ? (page[page.length - 1]?.id.value ?? null) : null };
  }

  async listByTenderId(): Promise<Document[]> {
    return [];
  }

  async save(document: Document): Promise<void> {
    this.documents.set(document.id.value, document);
  }

  async createWithInitialVersion(input: { document: Document; version: DocumentVersion }): Promise<void> {
    this.documents.set(input.document.id.value, input.document);
    await this.versionSink?.(input.version);
  }

  async addVersionAndPromote(input: { document: Document; version: DocumentVersion }): Promise<void> {
    const existingNumbers = (await this.versionsByDocument?.(input.document.id.value)) ?? [];
    if (existingNumbers.includes(input.version.versionNumber)) {
      throw new ConcurrentVersionCreationError();
    }
    this.documents.set(input.document.id.value, input.document);
    await this.versionSink?.(input.version);
  }

  async hardDeleteJustCreatedDocument(input: { organizationId: string; documentId: string }): Promise<void> {
    const document = this.documents.get(input.documentId);
    if (document && document.organizationId === input.organizationId) {
      this.documents.delete(input.documentId);
    }
    await this.versionDeleteSink?.(input.documentId);
  }

  /** Câblé par l'orchestrateur de fakes pour retirer aussi les DocumentVersion associées. */
  versionDeleteSink?: (documentId: string) => Promise<void>;

  /** Câblé par le test/l'orchestrateur de fakes pour que les versions créées via les méthodes
   *  composites atterrissent aussi dans `InMemoryDocumentVersionRepository` — évite de dupliquer
   *  un mini-store de versions ici. */
  versionSink?: (version: DocumentVersion) => Promise<void>;
  versionsByDocument?: (documentId: string) => Promise<number[]>;
}

export class InMemoryDocumentVersionRepository implements DocumentVersionRepository {
  readonly versions = new Map<string, DocumentVersion>();

  async seed(version: DocumentVersion): Promise<void> {
    this.versions.set(version.id, version);
  }

  async findById(input: {
    organizationId: string;
    documentId: string;
    versionId: string;
  }): Promise<DocumentVersion | null> {
    const version = this.versions.get(input.versionId);
    if (
      !version ||
      version.organizationId !== input.organizationId ||
      version.documentId !== input.documentId
    ) {
      return null;
    }
    return version;
  }

  async listByDocument(input: { organizationId: string; documentId: string }): Promise<DocumentVersion[]> {
    return [...this.versions.values()]
      .filter((version) => version.organizationId === input.organizationId && version.documentId === input.documentId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  async findByIds(input: { organizationId: string; versionIds: readonly string[] }): Promise<DocumentVersion[]> {
    const allowed = new Set(input.versionIds);
    return [...this.versions.values()].filter(
      (version) => version.organizationId === input.organizationId && allowed.has(version.id),
    );
  }

  async getHighestVersionNumber(input: { organizationId: string; documentId: string }): Promise<number> {
    const versions = await this.listByDocument(input);
    return versions.reduce((max, version) => Math.max(max, version.versionNumber), 0);
  }
}

/** Assemble un `InMemoryDocumentRepository` et un `InMemoryDocumentVersionRepository`
 *  cohérents entre eux pour les tests de use case (les méthodes composites du premier
 *  écrivent réellement dans le second). */
export function wireDocumentFakes(): {
  documentRepository: InMemoryDocumentRepository;
  versionRepository: InMemoryDocumentVersionRepository;
} {
  const documentRepository = new InMemoryDocumentRepository();
  const versionRepository = new InMemoryDocumentVersionRepository();
  documentRepository.versionSink = async (version) => {
    versionRepository.versions.set(version.id, version);
  };
  documentRepository.versionsByDocument = async (documentId) => {
    return [...versionRepository.versions.values()]
      .filter((version) => version.documentId === documentId)
      .map((version) => version.versionNumber);
  };
  documentRepository.versionDeleteSink = async (documentId) => {
    for (const version of [...versionRepository.versions.values()]) {
      if (version.documentId === documentId) {
        versionRepository.versions.delete(version.id);
      }
    }
  };
  return { documentRepository, versionRepository };
}

export class InMemoryDocumentTenderAssociationRepository implements DocumentTenderAssociationRepository {
  private readonly associations = new Map<string, DocumentTenderAssociation>();

  private key(documentId: string, tenderId: string): string {
    return `${documentId}::${tenderId}`;
  }

  async exists(input: { organizationId: string; documentId: string; tenderId: string }): Promise<boolean> {
    const association = this.associations.get(this.key(input.documentId, input.tenderId));
    return !!association && association.organizationId === input.organizationId;
  }

  async create(association: DocumentTenderAssociation): Promise<void> {
    this.associations.set(this.key(association.documentId, association.tenderId), association);
  }

  async delete(input: { organizationId: string; documentId: string; tenderId: string }): Promise<void> {
    this.associations.delete(this.key(input.documentId, input.tenderId));
  }

  async listTenderIdsByDocument(input: { organizationId: string; documentId: string }): Promise<readonly string[]> {
    return [...this.associations.values()]
      .filter((association) => association.documentId === input.documentId && association.organizationId === input.organizationId)
      .map((association) => association.tenderId);
  }
}

export class InMemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { content: Buffer; contentType: string }>();

  async put(input: { key: string; content: Readable; contentType: string; sizeBytes: number }): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.objects.set(input.key, { content: Buffer.concat(chunks), contentType: input.contentType });
  }

  async openReadStream(key: string): Promise<Readable> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object at key "${key}"`);
    return Readable.from(object.content);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async getMetadata(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.content.length, contentType: object.contentType } : null;
  }
}
