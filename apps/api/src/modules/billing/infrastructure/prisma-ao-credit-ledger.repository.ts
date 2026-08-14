import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AoCreditLedgerEntry as PrismaAoCreditLedgerEntry } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AoCreditMovementType } from "../domain/ao-credit-movement-type";
import { createAoCreditLedgerEntry, type AoCreditLedgerEntry } from "../domain/ao-credit-ledger-entry";
import { AoCreditAdjustmentWouldGoNegativeError, AoCreditConsumptionAlreadyReversedError, AoCreditLedgerEntryNotFoundError } from "../domain/errors";
import type { AoCreditLedgerPage, AoCreditLedgerRepository } from "../application/ports/ao-credit-ledger.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toDomain(row: PrismaAoCreditLedgerEntry): AoCreditLedgerEntry {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type as AoCreditMovementType,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    period: row.period ?? undefined,
    tenderId: row.tenderId ?? undefined,
    reason: row.reason ?? undefined,
    actorPlatformAdministratorId: row.actorPlatformAdministratorId ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * V2 Sprint 22 (billing, étape 22B) — `withTransaction` (PrismaService, Sprint 4 P1-001) rejoint la
 * transaction ambiante déjà active si présente (ex. `CreateTenderUseCase` enveloppant Tender +
 * consommation dans une seule transaction via son propre `ATOMIC_TRANSACTION_RUNNER`), sinon en
 * ouvre une nouvelle localement — le solde mutable et l'entrée de ledger sont TOUJOURS écrits
 * ensemble, jamais l'un sans l'autre.
 */
@Injectable()
export class PrismaAoCreditLedgerRepository implements AoCreditLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(organizationId: string): Promise<number> {
    const row = await this.prisma.currentClient().organizationAoCreditBalance.findUnique({ where: { organizationId } });
    return row?.balance ?? 0;
  }

  async grant(input: {
    organizationId: string;
    period: string;
    nominalAmount: number;
    rolloverCap: number;
    occurredAt: Date;
  }): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.aoCreditLedgerEntry.findFirst({ where: { organizationId: input.organizationId, type: AoCreditMovementType.Grant, period: input.period } });
      if (existing) {
        return { entry: toDomain(existing), alreadyApplied: true };
      }

      const balanceRow = await this.ensureBalanceRow(tx, input.organizationId);
      const appliedAmount = Math.max(0, Math.min(input.nominalAmount, input.rolloverCap - balanceRow.balance));
      const balanceAfter = balanceRow.balance + appliedAmount;

      await tx.organizationAoCreditBalance.update({ where: { organizationId: input.organizationId }, data: { balance: balanceAfter } });

      const domainEntry = createAoCreditLedgerEntry({
        id: randomUUID(),
        organizationId: input.organizationId,
        type: AoCreditMovementType.Grant,
        amount: appliedAmount,
        balanceAfter,
        period: input.period,
        occurredAt: input.occurredAt,
      });
      const created = await tx.aoCreditLedgerEntry.create({ data: this.toRow(domainEntry) });
      return { entry: toDomain(created), alreadyApplied: false };
    });
  }

  async consume(input: { organizationId: string; tenderId: string; amount: number; occurredAt: Date }): Promise<{ applied: boolean; entry: AoCreditLedgerEntry | null }> {
    return this.prisma.withTransaction(async (tx) => {
      await this.ensureBalanceRow(tx, input.organizationId);

      // Compare-and-set atomique : la clause WHERE `balance >= amount` est la SEULE autorité réelle
      // de la transition, jamais une lecture-puis-écriture inconditionnelle (même motif que le
      // correctif P1 `reclaimStaleGenerating`, Sprint 21).
      const result = await tx.organizationAoCreditBalance.updateMany({
        where: { organizationId: input.organizationId, balance: { gte: input.amount } },
        data: { balance: { decrement: input.amount } },
      });
      if (result.count === 0) {
        return { applied: false, entry: null };
      }

      const balanceRow = await tx.organizationAoCreditBalance.findUniqueOrThrow({ where: { organizationId: input.organizationId } });
      const domainEntry = createAoCreditLedgerEntry({
        id: randomUUID(),
        organizationId: input.organizationId,
        type: AoCreditMovementType.Consumption,
        amount: -input.amount,
        balanceAfter: balanceRow.balance,
        tenderId: input.tenderId,
        occurredAt: input.occurredAt,
      });
      const created = await tx.aoCreditLedgerEntry.create({ data: this.toRow(domainEntry) });
      return { applied: true, entry: toDomain(created) };
    });
  }

  async adjust(input: { organizationId: string; amount: number; reason: string; actorPlatformAdministratorId: string; occurredAt: Date }): Promise<AoCreditLedgerEntry> {
    return this.prisma.withTransaction(async (tx) => {
      await this.ensureBalanceRow(tx, input.organizationId);

      // Correctif audit Codex 22B (P1-02) — compare-and-set atomique, même motif que `consume()` :
      // `balance + amount >= 0` <=> `balance >= -amount` (vrai pour tout solde quand `amount` est
      // positif, exige un solde suffisant quand `amount` est négatif). Un ajustement qui ferait
      // passer le solde sous 0 est REFUSÉ, jamais silencieusement plafonné — le montant demandé et
      // le montant réellement appliqué ne divergent jamais sur ce ledger.
      const result = await tx.organizationAoCreditBalance.updateMany({
        where: { organizationId: input.organizationId, balance: { gte: -input.amount } },
        data: { balance: { increment: input.amount } },
      });
      if (result.count === 0) {
        const current = await tx.organizationAoCreditBalance.findUniqueOrThrow({ where: { organizationId: input.organizationId } });
        throw new AoCreditAdjustmentWouldGoNegativeError(input.organizationId, current.balance, input.amount);
      }

      const balanceRow = await tx.organizationAoCreditBalance.findUniqueOrThrow({ where: { organizationId: input.organizationId } });
      const domainEntry = createAoCreditLedgerEntry({
        id: randomUUID(),
        organizationId: input.organizationId,
        type: AoCreditMovementType.ManualAdjustment,
        amount: input.amount,
        balanceAfter: balanceRow.balance,
        reason: input.reason,
        actorPlatformAdministratorId: input.actorPlatformAdministratorId,
        occurredAt: input.occurredAt,
      });
      const created = await tx.aoCreditLedgerEntry.create({ data: this.toRow(domainEntry) });
      return toDomain(created);
    });
  }

  async reverseConsumption(input: { organizationId: string; tenderId: string; reason: string; actorPlatformAdministratorId: string; occurredAt: Date }): Promise<AoCreditLedgerEntry> {
    return this.prisma.withTransaction(async (tx) => {
      const consumption = await tx.aoCreditLedgerEntry.findFirst({ where: { organizationId: input.organizationId, type: AoCreditMovementType.Consumption, tenderId: input.tenderId } });
      if (!consumption) {
        throw new AoCreditLedgerEntryNotFoundError(input.tenderId);
      }
      // Vérification rapide pour un message d'erreur clair dans le cas non concurrent courant —
      // JAMAIS la protection réelle (voir plus bas).
      const alreadyReversed = await tx.aoCreditLedgerEntry.findFirst({ where: { organizationId: input.organizationId, type: AoCreditMovementType.Reversal, tenderId: input.tenderId } });
      if (alreadyReversed) {
        throw new AoCreditConsumptionAlreadyReversedError(input.tenderId);
      }

      const balanceRow = await this.ensureBalanceRow(tx, input.organizationId);
      const amount = -consumption.amount;
      const balanceAfter = balanceRow.balance + amount;

      await tx.organizationAoCreditBalance.update({ where: { organizationId: input.organizationId }, data: { balance: balanceAfter } });

      const domainEntry = createAoCreditLedgerEntry({
        id: randomUUID(),
        organizationId: input.organizationId,
        type: AoCreditMovementType.Reversal,
        amount,
        balanceAfter,
        tenderId: input.tenderId,
        reason: input.reason,
        actorPlatformAdministratorId: input.actorPlatformAdministratorId,
        occurredAt: input.occurredAt,
      });

      // Correctif audit Codex 22B (P1-01) — la SEULE protection réelle sous concurrence est l'index
      // unique partiel `(organization_id, tender_id) WHERE type = 'REVERSAL'` (migration dédiée) :
      // deux appels réellement simultanés peuvent tous deux passer la vérification `findFirst`
      // ci-dessus (aucun n'a encore committé), mais un seul des deux `INSERT` peut réussir. Le rejet
      // de l'autre fait échouer TOUTE la transaction (y compris l'incrément de solde ci-dessus),
      // jamais un double crédit.
      try {
        const created = await tx.aoCreditLedgerEntry.create({ data: this.toRow(domainEntry) });
        return toDomain(created);
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new AoCreditConsumptionAlreadyReversedError(input.tenderId);
        }
        throw error;
      }
    });
  }

  async findConsumptionByTenderId(organizationId: string, tenderId: string): Promise<AoCreditLedgerEntry | null> {
    const row = await this.prisma.currentClient().aoCreditLedgerEntry.findFirst({ where: { organizationId, type: AoCreditMovementType.Consumption, tenderId } });
    return row ? toDomain(row) : null;
  }

  async findGrantByPeriod(organizationId: string, period: string): Promise<AoCreditLedgerEntry | null> {
    const row = await this.prisma.currentClient().aoCreditLedgerEntry.findFirst({ where: { organizationId, type: AoCreditMovementType.Grant, period } });
    return row ? toDomain(row) : null;
  }

  async list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<AoCreditLedgerPage> {
    const rows = await this.prisma.currentClient().aoCreditLedgerEntry.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > options.limit;
    const page = hasNextPage ? rows.slice(0, options.limit) : rows;

    return { items: page.map(toDomain), nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** Crée paresseusement la ligne de solde (0) au premier mouvement de cette organisation — jamais
   *  une migration de données a posteriori pour les organisations existantes. */
  private async ensureBalanceRow(tx: Prisma.TransactionClient, organizationId: string): Promise<{ balance: number }> {
    const existing = await tx.organizationAoCreditBalance.findUnique({ where: { organizationId } });
    if (existing) {
      return existing;
    }
    return tx.organizationAoCreditBalance.create({ data: { id: randomUUID(), organizationId, balance: 0 } });
  }

  private toRow(entry: AoCreditLedgerEntry): Prisma.AoCreditLedgerEntryCreateInput {
    return {
      id: entry.id,
      organization: { connect: { id: entry.organizationId } },
      type: entry.type,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      period: entry.period ?? null,
      tenderId: entry.tenderId ?? null,
      reason: entry.reason ?? null,
      actorPlatformAdministratorId: entry.actorPlatformAdministratorId ?? null,
      createdAt: entry.createdAt,
    };
  }
}
