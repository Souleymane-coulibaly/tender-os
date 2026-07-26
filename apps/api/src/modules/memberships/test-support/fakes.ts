import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AuditLogEntry, AuditLogWriter } from "../application/ports/audit-log-writer";

export const FIXED_NOW = new Date("2026-07-26T14:00:00Z");

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
  readonly entries: AuditLogEntry[] = [];

  async record(entry: AuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}
