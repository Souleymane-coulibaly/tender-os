import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import { DceDocument } from "../domain/dce-document.entity";
import { Dce } from "../domain/dce.aggregate";
import { DceAlreadyExistsError } from "../domain/errors";
import type { AsyncJobSubmission, AsyncJobSubmitter } from "../application/ports/async-job-submitter";
import type { AuditLogWriter, DceAuditLogEntry } from "../application/ports/audit-log-writer";
import type { DceDocumentRepository } from "../application/ports/dce-document.repository";
import type { DceRepository } from "../application/ports/dce.repository";
import type { DetectedFileSignature, FileSignatureDetector } from "../application/ports/file-signature-detector";
import type { ZipArchiveInspector, ZipExtractedEntry, ZipImportLimits } from "../application/ports/zip-archive-inspector";
import type { DceDocumentSummary } from "../application/dtos";

export const FIXED_NOW = new Date("2026-07-27T14:00:00Z");

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
  readonly entries: DceAuditLogEntry[] = [];

  async record(entry: DceAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryDceRepository implements DceRepository {
  private readonly byId = new Map<string, Dce>();

  async seed(dce: Dce): Promise<void> {
    this.byId.set(dce.id.value, dce);
  }

  async findById(input: { organizationId: string; dceId: string }): Promise<Dce | null> {
    const dce = this.byId.get(input.dceId);
    if (!dce || dce.organizationId !== input.organizationId) {
      return null;
    }
    return dce;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dce | null> {
    return (
      [...this.byId.values()].find(
        (dce) => dce.organizationId === input.organizationId && dce.tenderId === input.tenderId,
      ) ?? null
    );
  }

  async create(dce: Dce): Promise<Dce> {
    const existing = await this.findByTenderId({ organizationId: dce.organizationId, tenderId: dce.tenderId });
    if (existing) {
      throw new DceAlreadyExistsError();
    }
    this.byId.set(dce.id.value, dce);
    return dce;
  }

  async save(dce: Dce): Promise<void> {
    this.byId.set(dce.id.value, dce);
  }
}

export class InMemoryDceDocumentRepository implements DceDocumentRepository {
  private readonly links: DceDocument[] = [];
  /** Simule les DocumentVersion réellement jointes en base — indexé par documentId. */
  readonly documentVersions = new Map<
    string,
    { originalFilename: string; sanitizedFilename: string; mimeType: string; extension: string; sizeBytes: number; checksum: string; currentVersionNumber: number; deleted?: boolean }
  >();

  async create(link: DceDocument): Promise<DceDocument> {
    this.links.push(link);
    return link;
  }

  async findByDceIdAndDocumentId(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
  }): Promise<DceDocument | null> {
    return (
      this.links.find(
        (link) =>
          link.organizationId === input.organizationId &&
          link.dceId === input.dceId &&
          link.documentId === input.documentId,
      ) ?? null
    );
  }

  private toSummary(link: DceDocument): DceDocumentSummary | null {
    const version = this.documentVersions.get(link.documentId);
    if (!version || version.deleted) {
      return null;
    }
    return {
      dceId: link.dceId,
      documentId: link.documentId,
      originalFilename: version.originalFilename,
      sanitizedFilename: version.sanitizedFilename,
      mimeType: version.mimeType,
      extension: version.extension,
      sizeBytes: version.sizeBytes,
      checksum: version.checksum,
      currentVersionNumber: version.currentVersionNumber,
      createdByUserId: link.createdByUserId,
      createdAt: link.createdAt.toISOString(),
    };
  }

  async listSummariesByDceId(input: { organizationId: string; dceId: string }): Promise<DceDocumentSummary[]> {
    return this.links
      .filter((link) => link.organizationId === input.organizationId && link.dceId === input.dceId)
      .map((link) => this.toSummary(link))
      .filter((summary): summary is DceDocumentSummary => summary !== null);
  }

  async getSummaryByDocumentId(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
  }): Promise<DceDocumentSummary | null> {
    const link = await this.findByDceIdAndDocumentId(input);
    return link ? this.toSummary(link) : null;
  }

  async findActiveByChecksum(input: {
    organizationId: string;
    dceId: string;
    checksum: string;
  }): Promise<DceDocumentSummary | null> {
    const summaries = await this.listSummariesByDceId(input);
    return summaries.find((summary) => summary.checksum === input.checksum) ?? null;
  }

  async countActiveByDceId(input: { organizationId: string; dceId: string }): Promise<number> {
    return (await this.listSummariesByDceId(input)).length;
  }
}

export class FakeFileSignatureDetector implements FileSignatureDetector {
  constructor(private readonly result: DetectedFileSignature | null = null) {}

  detect(): DetectedFileSignature | null {
    return this.result;
  }
}

export class FakeZipArchiveInspector implements ZipArchiveInspector {
  constructor(private readonly entries: readonly ZipExtractedEntry[] = []) {}

  async extract(_input: { buffer: Buffer; limits: ZipImportLimits }): Promise<ZipExtractedEntry[]> {
    return [...this.entries];
  }
}

export class NoopAsyncJobSubmitter implements AsyncJobSubmitter {
  readonly submitted: AsyncJobSubmission[] = [];

  async submit(job: AsyncJobSubmission): Promise<void> {
    this.submitted.push(job);
  }
}
