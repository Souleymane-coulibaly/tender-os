import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";
import type { AuditLogWriter, PricingScheduleAuditLogEntry } from "../application/ports/audit-log-writer";
import type { PricingScheduleFinalFileRepository } from "../application/ports/pricing-schedule-final-file.repository";
import type { PricingScheduleLineRepository } from "../application/ports/pricing-schedule-line.repository";
import type { PricingScheduleVersionRepository } from "../application/ports/pricing-schedule-version.repository";
import type { PricingScheduleRepository } from "../application/ports/pricing-schedule.repository";
import type { PricingScheduleFinalFile } from "../domain/pricing-schedule-final-file.value-object";
import type { PricingScheduleLine } from "../domain/pricing-schedule-line.entity";
import type { PricingScheduleVersion } from "../domain/pricing-schedule-version.entity";
import type { PricingSchedule } from "../domain/pricing-schedule.aggregate";

/** Fakes de test partagés — même motif que `technical-memo/test-support/fakes.ts` (Sprint 12) :
 *  implémentations en mémoire, jamais un mock partiel ad hoc dupliqué dans chaque fichier de test. */

export class FixedClock implements Clock {
  constructor(private value: Date = new Date("2026-01-01T00:00:00.000Z")) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class FakeAtomicTransactionRunner implements AtomicTransactionRunner {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: PricingScheduleAuditLogEntry[] = [];
  async record(entry: PricingScheduleAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryPricingScheduleRepository implements PricingScheduleRepository {
  readonly schedules: PricingSchedule[] = [];
  async create(schedule: PricingSchedule): Promise<void> {
    this.schedules.push(schedule);
  }
  async save(schedule: PricingSchedule): Promise<void> {
    const index = this.schedules.findIndex((s) => s.id === schedule.id);
    if (index === -1) this.schedules.push(schedule);
    else this.schedules[index] = schedule;
  }
  async findById(input: { organizationId: string; pricingScheduleId: string }): Promise<PricingSchedule | null> {
    return this.schedules.find((s) => s.id === input.pricingScheduleId && s.organizationId === input.organizationId) ?? null;
  }
  async findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string; sourceDocumentId: string }): Promise<PricingSchedule | null> {
    return (
      this.schedules.find(
        (s) =>
          s.organizationId === input.organizationId &&
          s.tenderId === input.tenderId &&
          (s.lotId ?? null) === input.lotId &&
          s.clientAccountId === input.clientAccountId &&
          s.sourceDocumentId === input.sourceDocumentId,
      ) ?? null
    );
  }
  async list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly PricingSchedule[]> {
    return this.schedules.filter(
      (s) =>
        s.organizationId === input.organizationId &&
        s.tenderId === input.tenderId &&
        (input.lotId === undefined || s.lotId === input.lotId) &&
        (input.clientAccountId === undefined || s.clientAccountId === input.clientAccountId),
    );
  }
}

export class InMemoryPricingScheduleVersionRepository implements PricingScheduleVersionRepository {
  readonly versions: PricingScheduleVersion[] = [];
  async create(version: PricingScheduleVersion): Promise<void> {
    this.versions.push(version);
  }
  async save(version: PricingScheduleVersion): Promise<void> {
    const index = this.versions.findIndex((v) => v.id === version.id);
    if (index === -1) this.versions.push(version);
    else this.versions[index] = version;
  }
  async findById(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<PricingScheduleVersion | null> {
    return this.versions.find((v) => v.id === input.pricingScheduleVersionId && v.organizationId === input.organizationId) ?? null;
  }
  async list(input: { organizationId: string; pricingScheduleId: string }): Promise<readonly PricingScheduleVersion[]> {
    return this.versions
      .filter((v) => v.organizationId === input.organizationId && v.pricingScheduleId === input.pricingScheduleId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }
}

export class InMemoryPricingScheduleLineRepository implements PricingScheduleLineRepository {
  readonly lines: PricingScheduleLine[] = [];
  async createMany(lines: readonly PricingScheduleLine[]): Promise<void> {
    this.lines.push(...lines);
  }
  async save(line: PricingScheduleLine): Promise<void> {
    const index = this.lines.findIndex((l) => l.id === line.id);
    if (index === -1) this.lines.push(line);
    else this.lines[index] = line;
  }
  async saveMany(lines: readonly PricingScheduleLine[]): Promise<void> {
    for (const line of lines) await this.save(line);
  }
  async findById(input: { organizationId: string; pricingScheduleLineId: string }): Promise<PricingScheduleLine | null> {
    return this.lines.find((l) => l.id === input.pricingScheduleLineId && l.organizationId === input.organizationId) ?? null;
  }
  async listByVersion(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<readonly PricingScheduleLine[]> {
    return this.lines.filter((l) => l.organizationId === input.organizationId && l.pricingScheduleVersionId === input.pricingScheduleVersionId);
  }
}

export class InMemoryPricingScheduleFinalFileRepository implements PricingScheduleFinalFileRepository {
  readonly finalFiles: PricingScheduleFinalFile[] = [];
  async create(finalFile: PricingScheduleFinalFile): Promise<void> {
    this.finalFiles.push(finalFile);
  }
  async listByVersion(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<readonly PricingScheduleFinalFile[]> {
    return this.finalFiles.filter((f) => f.organizationId === input.organizationId && f.pricingScheduleVersionId === input.pricingScheduleVersionId);
  }
}
