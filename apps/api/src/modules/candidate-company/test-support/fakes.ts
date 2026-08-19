import type { Clock } from "../../../shared-kernel/clock";
import type { AuditLogWriter, CandidateAuditLogEntry } from "../application/ports/audit-log-writer";
import type { CandidateCompanyRepository, ListCandidateCompaniesFilter, ListCandidateCompaniesResult } from "../application/ports/candidate-company.repository";
import type { CandidateCompany } from "../domain/candidate-company.aggregate";
import type { CandidateEstablishment } from "../domain/candidate-establishment.entity";
import { DuplicateCandidateCompanyNameError, DuplicateCandidateEstablishmentSiretError } from "../domain/errors";

export const FIXED_NOW = new Date("2026-08-17T10:00:00Z");

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
  readonly entries: CandidateAuditLogEntry[] = [];
  async record(entry: CandidateAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/**
 * Fausse implémentation en mémoire (mission §"tests") — reproduit fidèlement la portée
 * multi-tenant du repository Prisma réel (`findFirst({ where: { organizationId, ... } })`) : c'est
 * cette portée, testée ici, qui garantit qu'aucune requête ne peut jamais traverser une frontière
 * d'organisation.
 */
export class InMemoryCandidateCompanyRepository implements CandidateCompanyRepository {
  private readonly companiesById = new Map<string, CandidateCompany>();
  private readonly establishmentsById = new Map<string, CandidateEstablishment>();

  async findById(input: { organizationId: string; candidateCompanyId: string }): Promise<CandidateCompany | null> {
    const company = this.companiesById.get(input.candidateCompanyId);
    return company && company.organizationId === input.organizationId ? company : null;
  }

  async findByNormalizedName(input: { organizationId: string; nameNormalized: string }): Promise<CandidateCompany | null> {
    for (const company of this.companiesById.values()) {
      if (company.organizationId === input.organizationId && company.nameNormalized === input.nameNormalized) return company;
    }
    return null;
  }

  async findBySourceClientAccountId(input: { organizationId: string; sourceClientAccountId: string }): Promise<CandidateCompany | null> {
    for (const company of this.companiesById.values()) {
      if (company.organizationId === input.organizationId && company.sourceClientAccountId === input.sourceClientAccountId) return company;
    }
    return null;
  }

  async create(company: CandidateCompany): Promise<void> {
    const existing = await this.findByNormalizedName({ organizationId: company.organizationId, nameNormalized: company.nameNormalized });
    if (existing) throw new DuplicateCandidateCompanyNameError();
    this.companiesById.set(company.id, company);
  }

  async save(company: CandidateCompany): Promise<void> {
    this.companiesById.set(company.id, company);
  }

  async list(filter: ListCandidateCompaniesFilter): Promise<ListCandidateCompaniesResult> {
    let items = [...this.companiesById.values()].filter((c) => c.organizationId === filter.organizationId);
    if (!filter.includeArchived) items = items.filter((c) => !c.archivedAt);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items, nextCursor: null, total: items.length };
  }

  async findEstablishmentBySiret(input: { organizationId: string; siret: string }): Promise<CandidateEstablishment | null> {
    for (const establishment of this.establishmentsById.values()) {
      if (establishment.organizationId === input.organizationId && establishment.siret === input.siret) return establishment;
    }
    return null;
  }

  async createEstablishment(establishment: CandidateEstablishment): Promise<void> {
    const existing = await this.findEstablishmentBySiret({ organizationId: establishment.organizationId, siret: establishment.siret });
    if (existing) throw new DuplicateCandidateEstablishmentSiretError();
    this.establishmentsById.set(establishment.id, establishment);
  }

  async listEstablishmentsByCompany(input: { organizationId: string; candidateCompanyId: string }): Promise<readonly CandidateEstablishment[]> {
    // Même ordre que le repository Prisma réel (mission A6.4 §9) — principal d'abord, puis
    // création croissante.
    return [...this.establishmentsById.values()]
      .filter((e) => e.organizationId === input.organizationId && e.candidateCompanyId === input.candidateCompanyId)
      .sort((a, b) => Number(b.isPrincipal) - Number(a.isPrincipal) || a.createdAt.getTime() - b.createdAt.getTime());
  }
}
