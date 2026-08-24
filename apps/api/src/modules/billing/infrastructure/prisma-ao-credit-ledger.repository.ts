import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AoCreditLedgerEntry as PrismaAoCreditLedgerEntry } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import { AoCreditMovementType } from "../domain/ao-credit-movement-type";
import { createAoCreditLedgerEntry, type AoCreditLedgerEntry } from "../domain/ao-credit-ledger-entry";
import { AoCreditAdjustmentWouldGoNegativeError, AoCreditConsumptionAlreadyReversedError, AoCreditLedgerEntryNotFoundError, ConcurrentAoCreditLedgerWriteError } from "../domain/errors";
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

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 2 — correctif d'un gap audité (jusqu'ici seuls
   * `grantTrial()`/`reverseConsumption()` protégeaient leur `INSERT` par un `try/catch` sur la
   * violation d'index unique) : un job mensuel relancé (retry, redémarrage, double exécution) et le
   * webhook Stripe `invoice.paid` peuvent désormais tous deux tenter un grant pour LE MÊME
   * (organizationId, period) à quelques millisecondes d'écart — les deux passent le `findFirst`
   * ci-dessous (aucun n'a encore commité), un seul `INSERT` réussit. Le second échoue (P2002) sur
   * l'index unique partiel déjà en place (`ao_credit_ledger_entries_grant_period_unique`) ; sa
   * transaction ENTIÈRE échoue avec (solde incrémenté y compris — jamais un double crédit), et ce
   * repository relit HORS transaction (rollback terminé) l'entrée gagnante plutôt que de laisser
   * l'erreur brute remonter.
   */
  async grant(input: {
    organizationId: string;
    period: string;
    nominalAmount: number;
    rolloverCap: number;
    occurredAt: Date;
  }): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }> {
    // Checkpoint TENDEROS-2.1-P2.3-E9 (correctif P1, trouvé par un vrai test HTTP + PostgreSQL) —
    // capturé AVANT `withTransaction` : si un appelant a déjà ouvert une transaction ambiante, une
    // violation d'index unique ci-dessous la fait échouer ENTIÈREMENT (jamais une relecture de
    // secours à l'intérieur d'une transaction avortée, voir le commentaire de classe de
    // `ConcurrentAoCreditLedgerWriteError`).
    const hadAmbientTransaction = TransactionalContext.current() !== undefined;
    try {
      return await this.prisma.withTransaction(async (tx) => {
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
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        if (hadAmbientTransaction) {
          throw new ConcurrentAoCreditLedgerWriteError(input.organizationId);
        }
        const winning = await this.prisma.currentClient().aoCreditLedgerEntry.findFirstOrThrow({ where: { organizationId: input.organizationId, type: AoCreditMovementType.Grant, period: input.period } });
        return { entry: toDomain(winning), alreadyApplied: true };
      }
      throw error;
    }
  }

  async grantTrial(input: { organizationId: string; occurredAt: Date }): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }> {
    // Voir le commentaire de `grant()` ci-dessus — même garde.
    const hadAmbientTransaction = TransactionalContext.current() !== undefined;
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const existing = await tx.aoCreditLedgerEntry.findFirst({ where: { organizationId: input.organizationId, type: AoCreditMovementType.TrialGrant } });
        if (existing) {
          return { entry: toDomain(existing), alreadyApplied: true };
        }

        const balanceRow = await this.ensureBalanceRow(tx, input.organizationId);
        const balanceAfter = balanceRow.balance + 1;
        await tx.organizationAoCreditBalance.update({ where: { organizationId: input.organizationId }, data: { balance: balanceAfter } });

        const domainEntry = createAoCreditLedgerEntry({
          id: randomUUID(),
          organizationId: input.organizationId,
          type: AoCreditMovementType.TrialGrant,
          amount: 1,
          balanceAfter,
          occurredAt: input.occurredAt,
        });
        const created = await tx.aoCreditLedgerEntry.create({ data: this.toRow(domainEntry) });
        return { entry: toDomain(created), alreadyApplied: false };
      });
    } catch (error) {
      // Correctif Sprint 25 (durcissement, même motif que `reverseConsumption` — audité comme
      // manquant sur `grant()` ci-dessus) — la SEULE protection réelle sous concurrence est l'index
      // unique partiel `(organization_id) WHERE type = 'TRIAL_GRANT'` (migration dédiée) : deux
      // appels réellement simultanés peuvent tous deux passer le `findFirst` ci-dessus (aucun n'a
      // encore committé), mais un seul `INSERT` peut réussir — l'échec du second fait échouer TOUTE
      // sa transaction (solde inclus, jamais un double crédit ni un solde orphelin). Une transaction
      // Postgres avortée refuse toute nouvelle requête EN SON SEIN (contrairement à un simple
      // `try/catch` local) : la relecture de l'entrée gagnante se fait donc volontairement HORS de
      // cette transaction, une fois le rollback terminé.
      if (isUniqueConstraintViolation(error)) {
        if (hadAmbientTransaction) {
          throw new ConcurrentAoCreditLedgerWriteError(input.organizationId);
        }
        const winning = await this.prisma.currentClient().aoCreditLedgerEntry.findFirstOrThrow({ where: { organizationId: input.organizationId, type: AoCreditMovementType.TrialGrant } });
        return { entry: toDomain(winning), alreadyApplied: true };
      }
      throw error;
    }
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 (AO CREDIT IDEMPOTENCE) — clé logique
   * `organizationId + tenderId + CONSUMPTION` : un Tender ne peut jamais produire une seconde
   * décrémentation, quel que soit le nombre d'appels (retry, replace, multi-lot, resoumission après
   * retrait — `RecordTenderSubmissionUseCase` appelle ce chemin à chaque dépôt réussi, jamais
   * seulement au "premier" au sens applicatif). Double protection, même motif que
   * `grantTrial()`/`reverseConsumption()` ci-dessus :
   *   1. Pré-vérification `findFirst` (chemin rapide, non-concurrent) — une CONSUMPTION déjà
   *      présente pour ce (organizationId, tenderId) rend l'appel un no-op immédiat, AUCUNE
   *      décrémentation supplémentaire.
   *   2. Sous concurrence réelle (deux premiers dépôts simultanés pour le MÊME tenderId), seule
   *      l'autorité réelle est l'index unique PARTIEL `(organization_id, tender_id) WHERE
   *      type = 'CONSUMPTION'` : le second `INSERT` échoue (P2002), fait échouer TOUTE sa
   *      transaction (solde décrémenté y compris — jamais un solde orphelin), et ce repository
   *      relit HORS transaction (rollback terminé) l'entrée gagnante pour renvoyer un résultat
   *      idempotent au lieu de laisser l'erreur brute remonter.
   */
  async consume(input: { organizationId: string; tenderId: string; amount: number; occurredAt: Date }): Promise<{ applied: boolean; entry: AoCreditLedgerEntry | null }> {
    // Voir le commentaire de `grant()` — même garde. C'est LE chemin réellement exercé par
    // `RecordTenderSubmissionUseCase` (transaction ambiante déjà ouverte), voir le test HTTP dédié
    // "double-clic / retry" (`ao-credit-consumption-http.integration.spec.ts`).
    const hadAmbientTransaction = TransactionalContext.current() !== undefined;
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const existing = await tx.aoCreditLedgerEntry.findFirst({ where: { organizationId: input.organizationId, type: AoCreditMovementType.Consumption, tenderId: input.tenderId } });
        if (existing) {
          return { applied: true, entry: toDomain(existing) };
        }

        await this.ensureBalanceRow(tx, input.organizationId);

        // Compare-and-set atomique : la clause WHERE `balance >= amount` est la SEULE autorité
        // réelle de la transition, jamais une lecture-puis-écriture inconditionnelle (même motif que
        // le correctif P1 `reclaimStaleGenerating`, Sprint 21).
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
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        // Checkpoint TENDEROS-2.1-P2.3-E9 — jamais une relecture de secours "réussie" ici : le
        // perdant croirait avoir consommé le même crédit que le gagnant et procéderait à écrire SA
        // PROPRE ligne `TenderSubmission` dans la même transaction ambiante déjà vouée à l'échec
        // (aucune contrainte unique ne protège `tender_submissions` contre un doublon par tenderId —
        // seule cette garde empêche concrètement le double dépôt). Échec explicite et propre,
        // jamais un succès fantôme.
        if (hadAmbientTransaction) {
          throw new ConcurrentAoCreditLedgerWriteError(input.organizationId);
        }
        const winning = await this.prisma.currentClient().aoCreditLedgerEntry.findFirstOrThrow({ where: { organizationId: input.organizationId, type: AoCreditMovementType.Consumption, tenderId: input.tenderId } });
        return { applied: true, entry: toDomain(winning) };
      }
      throw error;
    }
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

  async findLatestGrantPeriod(organizationId: string): Promise<string | null> {
    const row = await this.prisma.currentClient().aoCreditLedgerEntry.findFirst({
      where: { organizationId, type: AoCreditMovementType.Grant },
      orderBy: { period: "desc" },
      select: { period: true },
    });
    return row?.period ?? null;
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
