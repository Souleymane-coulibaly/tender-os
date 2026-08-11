import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { OutboxEventInput, OutboxWriter } from "../../outbox";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";
import type { AuditLogWriter, ResponsePackageAuditLogEntry } from "../application/ports/audit-log-writer";
import type { PackageArtifactRepository } from "../application/ports/package-artifact.repository";
import type { PackageItemRepository } from "../application/ports/package-item.repository";
import type { ResponsePackageVersionRepository } from "../application/ports/response-package-version.repository";
import type { ResponsePackageDashboardRow, ResponsePackageRepository } from "../application/ports/response-package.repository";
import type { PackageArtifact } from "../domain/package-artifact.value-object";
import type { PackageItem } from "../domain/package-item.entity";
import type { ResponsePackageVersion } from "../domain/response-package-version.entity";
import type { ResponsePackage } from "../domain/response-package.aggregate";

/** Fakes de test partagés — même motif que `pricing-schedule/test-support/fakes.ts` (Sprint 13). */

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
  readonly entries: ResponsePackageAuditLogEntry[] = [];
  async record(entry: ResponsePackageAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryOutboxWriter implements OutboxWriter {
  readonly events: (OutboxEventInput & { organizationId: string })[] = [];
  async write(input: { organizationId: string; events: OutboxEventInput[] }): Promise<void> {
    this.events.push(...input.events.map((event) => ({ ...event, organizationId: input.organizationId })));
  }
}

export class InMemoryResponsePackageRepository implements ResponsePackageRepository {
  readonly packages: ResponsePackage[] = [];
  async create(pkg: ResponsePackage): Promise<void> {
    this.packages.push(pkg);
  }
  async save(pkg: ResponsePackage): Promise<void> {
    const index = this.packages.findIndex((p) => p.id === pkg.id);
    if (index === -1) this.packages.push(pkg);
    else this.packages[index] = pkg;
  }
  async findById(input: { organizationId: string; responsePackageId: string }): Promise<ResponsePackage | null> {
    return this.packages.find((p) => p.id === input.responsePackageId && p.organizationId === input.organizationId) ?? null;
  }
  async findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string }): Promise<ResponsePackage | null> {
    return (
      this.packages.find(
        (p) => p.organizationId === input.organizationId && p.tenderId === input.tenderId && (p.lotId ?? null) === input.lotId && p.clientAccountId === input.clientAccountId,
      ) ?? null
    );
  }
  async list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly ResponsePackage[]> {
    return this.packages.filter(
      (p) => p.organizationId === input.organizationId && p.tenderId === input.tenderId && (input.lotId === undefined || p.lotId === input.lotId) && (input.clientAccountId === undefined || p.clientAccountId === input.clientAccountId),
    );
  }
  async listForDashboard(input: { organizationId: string; restrictToClientAccountIds?: readonly string[] | undefined }): Promise<readonly ResponsePackageDashboardRow[]> {
    return this.packages
      .filter((p) => p.organizationId === input.organizationId && (input.restrictToClientAccountIds === undefined || input.restrictToClientAccountIds.includes(p.clientAccountId)))
      .map((p) => ({ id: p.id, tenderId: p.tenderId, lotId: p.lotId ?? null, clientAccountId: p.clientAccountId, status: p.status }));
  }
}

export class InMemoryResponsePackageVersionRepository implements ResponsePackageVersionRepository {
  readonly versions: ResponsePackageVersion[] = [];
  async create(version: ResponsePackageVersion): Promise<void> {
    this.versions.push(version);
  }
  async save(version: ResponsePackageVersion): Promise<void> {
    const index = this.versions.findIndex((v) => v.id === version.id);
    if (index === -1) this.versions.push(version);
    else this.versions[index] = version;
  }
  async findById(input: { organizationId: string; responsePackageVersionId: string }): Promise<ResponsePackageVersion | null> {
    return this.versions.find((v) => v.id === input.responsePackageVersionId && v.organizationId === input.organizationId) ?? null;
  }
  async list(input: { organizationId: string; responsePackageId: string }): Promise<readonly ResponsePackageVersion[]> {
    return this.versions.filter((v) => v.organizationId === input.organizationId && v.responsePackageId === input.responsePackageId).sort((a, b) => b.versionNumber - a.versionNumber);
  }
}

export class InMemoryPackageItemRepository implements PackageItemRepository {
  readonly items: PackageItem[] = [];
  async createMany(items: readonly PackageItem[]): Promise<void> {
    this.items.push(...items);
  }
  async save(item: PackageItem): Promise<void> {
    const index = this.items.findIndex((i) => i.id === item.id);
    if (index === -1) this.items.push(item);
    else this.items[index] = item;
  }
  async findById(input: { organizationId: string; packageItemId: string }): Promise<PackageItem | null> {
    return this.items.find((i) => i.id === input.packageItemId && i.organizationId === input.organizationId) ?? null;
  }
  async listByVersion(input: { organizationId: string; responsePackageVersionId: string }): Promise<readonly PackageItem[]> {
    return this.items.filter((i) => i.organizationId === input.organizationId && i.responsePackageVersionId === input.responsePackageVersionId);
  }
}

export class InMemoryPackageArtifactRepository implements PackageArtifactRepository {
  readonly artifacts: PackageArtifact[] = [];
  async create(artifact: PackageArtifact): Promise<void> {
    this.artifacts.push(artifact);
  }
  async listByVersion(input: { organizationId: string; responsePackageVersionId: string }): Promise<readonly PackageArtifact[]> {
    return this.artifacts.filter((a) => a.organizationId === input.organizationId && a.responsePackageVersionId === input.responsePackageVersionId);
  }
}
