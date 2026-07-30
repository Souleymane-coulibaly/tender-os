import type { Clock } from "../../../shared-kernel/clock";
import type { AuditLogWriter, ClientAuditLogEntry } from "../application/ports/audit-log-writer";
import type { ClientAccountRepository, ListClientAccountsFilter, ListClientAccountsResult } from "../application/ports/client-account.repository";
import type { ClientAssignmentRepository } from "../application/ports/client-assignment.repository";
import type { ClientAccount } from "../domain/client-account.aggregate";
import { DuplicateClientAccountNameError, DuplicateClientAssignmentError } from "../domain/errors";
import type { ClientAssignment } from "../domain/client-assignment.entity";

export const FIXED_NOW = new Date("2026-07-30T10:00:00Z");

export class FixedClock implements Clock {
  constructor(private value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: ClientAuditLogEntry[] = [];
  async record(entry: ClientAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryClientAccountRepository implements ClientAccountRepository {
  private readonly byId = new Map<string, ClientAccount>();

  async findById(input: { organizationId: string; clientAccountId: string }): Promise<ClientAccount | null> {
    const client = this.byId.get(input.clientAccountId);
    return client && client.organizationId === input.organizationId ? client : null;
  }

  async findByNormalizedName(input: { organizationId: string; nameNormalized: string }): Promise<ClientAccount | null> {
    for (const client of this.byId.values()) {
      if (client.organizationId === input.organizationId && client.nameNormalized === input.nameNormalized) return client;
    }
    return null;
  }

  async create(client: ClientAccount): Promise<void> {
    const existing = await this.findByNormalizedName({ organizationId: client.organizationId, nameNormalized: client.nameNormalized });
    if (existing) throw new DuplicateClientAccountNameError();
    this.byId.set(client.id, client);
  }

  async save(client: ClientAccount): Promise<void> {
    this.byId.set(client.id, client);
  }

  async delete(input: { organizationId: string; clientAccountId: string }): Promise<void> {
    this.byId.delete(input.clientAccountId);
  }

  async countTendersByClient(): Promise<number> {
    return 0;
  }

  async countAssignmentsByClient(input: { organizationId: string; clientAccountId: string }): Promise<number> {
    return [...this.byId.values()].filter((c) => c.organizationId === input.organizationId && c.id === input.clientAccountId).length;
  }

  async list(filter: ListClientAccountsFilter): Promise<ListClientAccountsResult> {
    let items = [...this.byId.values()].filter((c) => c.organizationId === filter.organizationId);
    if (filter.restrictToClientAccountIds) {
      const allowed = new Set(filter.restrictToClientAccountIds);
      items = items.filter((c) => allowed.has(c.id));
    }
    if (filter.status) items = items.filter((c) => c.status === filter.status);
    if (!filter.includeArchived) items = items.filter((c) => !c.archivedAt);
    if (filter.nameSearch) items = items.filter((c) => c.name.toLowerCase().includes(filter.nameSearch!.toLowerCase()));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items, nextCursor: null, total: items.length };
  }
}

export class InMemoryClientAssignmentRepository implements ClientAssignmentRepository {
  private readonly byId = new Map<string, ClientAssignment>();

  async findById(input: { organizationId: string; assignmentId: string }): Promise<ClientAssignment | null> {
    const assignment = this.byId.get(input.assignmentId);
    return assignment && assignment.organizationId === input.organizationId ? assignment : null;
  }

  async findByClientAndUser(input: { organizationId: string; clientAccountId: string; userId: string }): Promise<ClientAssignment | null> {
    for (const assignment of this.byId.values()) {
      if (assignment.organizationId === input.organizationId && assignment.clientAccountId === input.clientAccountId && assignment.userId === input.userId) {
        return assignment;
      }
    }
    return null;
  }

  async create(assignment: ClientAssignment): Promise<void> {
    const existing = await this.findByClientAndUser(assignment);
    if (existing) throw new DuplicateClientAssignmentError();
    this.byId.set(assignment.id, assignment);
  }

  async save(assignment: ClientAssignment): Promise<void> {
    this.byId.set(assignment.id, assignment);
  }

  async delete(input: { organizationId: string; assignmentId: string }): Promise<void> {
    this.byId.delete(input.assignmentId);
  }

  async listByClient(input: { organizationId: string; clientAccountId: string }): Promise<readonly ClientAssignment[]> {
    return [...this.byId.values()].filter((a) => a.organizationId === input.organizationId && a.clientAccountId === input.clientAccountId);
  }

  async listClientAccountIdsByUser(input: { organizationId: string; userId: string }): Promise<readonly string[]> {
    return [...this.byId.values()].filter((a) => a.organizationId === input.organizationId && a.userId === input.userId).map((a) => a.clientAccountId);
  }
}
