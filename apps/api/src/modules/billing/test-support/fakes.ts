import type { Clock } from "../../../shared-kernel/clock";
import { AoCreditMovementType } from "../domain/ao-credit-movement-type";
import { createAoCreditLedgerEntry, type AoCreditLedgerEntry } from "../domain/ao-credit-ledger-entry";
import type { EntitlementFeature } from "../domain/entitlement-feature";
import { EntitlementOverride } from "../domain/entitlement-override.aggregate";
import { AoCreditAdjustmentWouldGoNegativeError, AoCreditConsumptionAlreadyReversedError, AoCreditLedgerEntryNotFoundError } from "../domain/errors";
import { PassPurchaseStatus } from "../domain/pass-purchase-status";
import type { QuotaType } from "../domain/quota-type";
import type { OrganizationSubscription } from "../domain/organization-subscription.aggregate";
import { PassPurchase } from "../domain/pass-purchase.aggregate";
import type { AoCreditLedgerPage, AoCreditLedgerRepository } from "../application/ports/ao-credit-ledger.repository";
import type { AuditLogWriter, BillingAuditLogEntry } from "../application/ports/audit-log-writer";
import type { EntitlementOverridePage, EntitlementOverrideRepository } from "../application/ports/entitlement-override.repository";
import type { OrganizationSubscriptionRepository } from "../application/ports/organization-subscription.repository";
import {
  PassPurchaseExternalReferenceConflictError,
  type PassPurchasePage,
  type PassPurchaseRepository,
} from "../application/ports/pass-purchase.repository";

export const FIXED_NOW = new Date("2026-08-13T09:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: BillingAuditLogEntry[] = [];
  async record(entry: BillingAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryEntitlementOverrideRepository implements EntitlementOverrideRepository {
  private readonly byId = new Map<string, EntitlementOverride>();

  async findById(organizationId: string, id: string): Promise<EntitlementOverride | null> {
    const override = this.byId.get(id);
    return override && override.organizationId === organizationId ? override : null;
  }

  async findActiveFeatureOverride(organizationId: string, feature: EntitlementFeature, now: Date): Promise<EntitlementOverride | null> {
    for (const override of this.byId.values()) {
      if (override.organizationId === organizationId && override.feature === feature && override.isActive(now)) {
        return override;
      }
    }
    return null;
  }

  async findActiveQuotaOverride(organizationId: string, quota: QuotaType, now: Date): Promise<EntitlementOverride | null> {
    for (const override of this.byId.values()) {
      if (override.organizationId === organizationId && override.quota === quota && override.isActive(now)) {
        return override;
      }
    }
    return null;
  }

  async list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<EntitlementOverridePage> {
    const all = Array.from(this.byId.values())
      .filter((o) => o.organizationId === organizationId)
      .sort((a, b) => b.toProps().createdAt.getTime() - a.toProps().createdAt.getTime() || b.id.localeCompare(a.id));

    const startIndex = options.cursor ? all.findIndex((o) => o.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit + 1);
    const hasNextPage = page.length > options.limit;
    const items = hasNextPage ? page.slice(0, options.limit) : page;

    return { items, nextCursor: hasNextPage ? (items[items.length - 1]?.id ?? null) : null };
  }

  async save(override: EntitlementOverride): Promise<void> {
    this.byId.set(override.id, override);
  }
}

export class InMemoryOrganizationSubscriptionRepository implements OrganizationSubscriptionRepository {
  private readonly byOrganizationId = new Map<string, OrganizationSubscription>();

  async findByOrganizationId(organizationId: string): Promise<OrganizationSubscription | null> {
    return this.byOrganizationId.get(organizationId) ?? null;
  }

  async save(subscription: OrganizationSubscription): Promise<void> {
    this.byOrganizationId.set(subscription.organizationId, subscription);
  }
}

/** Même sémantique de compare-and-set que `PrismaPassPurchaseRepository.consumeForTender`
 *  (mission — reproduire fidèlement le comportement réel, pas seulement l'API, même exigence que
 *  le correctif P1 Sprint 21 pour `reclaimStaleGenerating`). */
export class InMemoryPassPurchaseRepository implements PassPurchaseRepository {
  private readonly byId = new Map<string, PassPurchase>();

  async findById(organizationId: string, id: string): Promise<PassPurchase | null> {
    const purchase = this.byId.get(id);
    return purchase && purchase.organizationId === organizationId ? purchase : null;
  }

  async findByExternalReference(externalReference: string): Promise<PassPurchase | null> {
    for (const purchase of this.byId.values()) {
      if (purchase.toProps().externalReference === externalReference) {
        return purchase;
      }
    }
    return null;
  }

  async findByTenderId(organizationId: string, tenderId: string): Promise<PassPurchase | null> {
    for (const purchase of this.byId.values()) {
      if (purchase.organizationId === organizationId && purchase.consumedTenderId === tenderId) {
        return purchase;
      }
    }
    return null;
  }

  async existsForOrganization(organizationId: string): Promise<boolean> {
    for (const purchase of this.byId.values()) {
      if (purchase.organizationId === organizationId) {
        return true;
      }
    }
    return false;
  }

  async findFirstAvailable(organizationId: string, now: Date): Promise<PassPurchase | null> {
    const candidates = Array.from(this.byId.values())
      .filter((p) => p.organizationId === organizationId && p.status === PassPurchaseStatus.Available)
      .filter((p) => {
        const expiresAt = p.expiresAt;
        return expiresAt === undefined || expiresAt.getTime() > now.getTime();
      })
      .sort((a, b) => a.toProps().purchasedAt.getTime() - b.toProps().purchasedAt.getTime());
    return candidates[0] ?? null;
  }

  async list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<PassPurchasePage> {
    const all = Array.from(this.byId.values())
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => b.toProps().purchasedAt.getTime() - a.toProps().purchasedAt.getTime() || b.id.localeCompare(a.id));

    const startIndex = options.cursor ? all.findIndex((p) => p.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit + 1);
    const hasNextPage = page.length > options.limit;
    const items = hasNextPage ? page.slice(0, options.limit) : page;

    return { items, nextCursor: hasNextPage ? (items[items.length - 1]?.id ?? null) : null };
  }

  async create(purchase: PassPurchase): Promise<void> {
    // Vérification + écriture SYNCHRONES (voir le commentaire de `consumeForTender`) — reproduit la
    // contrainte UNIQUE réelle de `external_reference` sous deux appels concurrents.
    const externalReference = purchase.toProps().externalReference;
    for (const existing of this.byId.values()) {
      if (existing.toProps().externalReference === externalReference) {
        throw new PassPurchaseExternalReferenceConflictError(externalReference);
      }
    }
    this.byId.set(purchase.id, purchase);
  }

  async consumeForTender(input: {
    organizationId: string;
    passPurchaseId: string;
    tenderId: string;
    occurredAt: Date;
  }): Promise<{ applied: boolean; purchase: PassPurchase | null }> {
    // Lecture + vérification + écriture SYNCHRONES (aucun `await` avant `this.byId.set`) : reproduit
    // l'atomicité de la clause WHERE SQL du compare-and-set réel sous `Promise.all` concurrent — un
    // `await` intercalé ici permettrait à deux appels concurrents de tous les deux lire AVAILABLE
    // avant que l'un des deux n'écrive (même piège que le bug corrigé en Sprint 21, jamais reproduit
    // ici dans le fake).
    const current = this.byId.get(input.passPurchaseId);
    if (!current || current.organizationId !== input.organizationId) {
      return { applied: false, purchase: null };
    }

    const props = current.toProps();
    const eligible = props.status === PassPurchaseStatus.Available || (props.status === PassPurchaseStatus.Consumed && props.consumedTenderId === input.tenderId);
    if (!eligible) {
      return { applied: false, purchase: current };
    }

    const updated = PassPurchase.reconstitute({
      ...props,
      status: PassPurchaseStatus.Consumed,
      consumedTenderId: input.tenderId,
      consumedAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
    this.byId.set(updated.id, updated);
    return { applied: true, purchase: updated };
  }
}

/** V2 Sprint 22 (billing, étape 22B) — même discipline de sections critiques SYNCHRONES que les
 *  fakes ci-dessus (aucun `await` entre lecture et écriture du solde) : reproduit fidèlement le
 *  compare-and-set réel de `PrismaAoCreditLedgerRepository.consume` sous `Promise.all` concurrent. */
export class InMemoryAoCreditLedgerRepository implements AoCreditLedgerRepository {
  private readonly balances = new Map<string, number>();
  private readonly entries: AoCreditLedgerEntry[] = [];
  private sequence = 0;

  private nextId(): string {
    this.sequence += 1;
    return `ledger-entry-${this.sequence}`;
  }

  async getBalance(organizationId: string): Promise<number> {
    return this.balances.get(organizationId) ?? 0;
  }

  async grant(input: { organizationId: string; period: string; nominalAmount: number; rolloverCap: number; occurredAt: Date }): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }> {
    const existing = this.entries.find((e) => e.organizationId === input.organizationId && e.type === AoCreditMovementType.Grant && e.period === input.period);
    if (existing) {
      return { entry: existing, alreadyApplied: true };
    }

    const currentBalance = this.balances.get(input.organizationId) ?? 0;
    const appliedAmount = Math.max(0, Math.min(input.nominalAmount, input.rolloverCap - currentBalance));
    const balanceAfter = currentBalance + appliedAmount;

    const entry = createAoCreditLedgerEntry({
      id: this.nextId(),
      organizationId: input.organizationId,
      type: AoCreditMovementType.Grant,
      amount: appliedAmount,
      balanceAfter,
      period: input.period,
      occurredAt: input.occurredAt,
    });
    this.balances.set(input.organizationId, balanceAfter);
    this.entries.push(entry);
    return { entry, alreadyApplied: false };
  }

  async consume(input: { organizationId: string; tenderId: string; amount: number; occurredAt: Date }): Promise<{ applied: boolean; entry: AoCreditLedgerEntry | null }> {
    // Section critique SYNCHRONE (voir le commentaire de classe) : lecture + décision + écriture
    // sans `await` intercalé.
    const currentBalance = this.balances.get(input.organizationId) ?? 0;
    if (currentBalance < input.amount) {
      return { applied: false, entry: null };
    }

    const balanceAfter = currentBalance - input.amount;
    const entry = createAoCreditLedgerEntry({
      id: this.nextId(),
      organizationId: input.organizationId,
      type: AoCreditMovementType.Consumption,
      amount: -input.amount,
      balanceAfter,
      tenderId: input.tenderId,
      occurredAt: input.occurredAt,
    });
    this.balances.set(input.organizationId, balanceAfter);
    this.entries.push(entry);
    return { applied: true, entry };
  }

  async adjust(input: { organizationId: string; amount: number; reason: string; actorPlatformAdministratorId: string; occurredAt: Date }): Promise<AoCreditLedgerEntry> {
    const currentBalance = this.balances.get(input.organizationId) ?? 0;
    const balanceAfter = currentBalance + input.amount;
    if (balanceAfter < 0) {
      throw new AoCreditAdjustmentWouldGoNegativeError(input.organizationId, currentBalance, input.amount);
    }
    const entry = createAoCreditLedgerEntry({
      id: this.nextId(),
      organizationId: input.organizationId,
      type: AoCreditMovementType.ManualAdjustment,
      amount: input.amount,
      balanceAfter,
      reason: input.reason,
      actorPlatformAdministratorId: input.actorPlatformAdministratorId,
      occurredAt: input.occurredAt,
    });
    this.balances.set(input.organizationId, balanceAfter);
    this.entries.push(entry);
    return entry;
  }

  async reverseConsumption(input: { organizationId: string; tenderId: string; reason: string; actorPlatformAdministratorId: string; occurredAt: Date }): Promise<AoCreditLedgerEntry> {
    const consumption = this.entries.find((e) => e.organizationId === input.organizationId && e.type === AoCreditMovementType.Consumption && e.tenderId === input.tenderId);
    if (!consumption) {
      throw new AoCreditLedgerEntryNotFoundError(input.tenderId);
    }
    const alreadyReversed = this.entries.some((e) => e.organizationId === input.organizationId && e.type === AoCreditMovementType.Reversal && e.tenderId === input.tenderId);
    if (alreadyReversed) {
      throw new AoCreditConsumptionAlreadyReversedError(input.tenderId);
    }

    const currentBalance = this.balances.get(input.organizationId) ?? 0;
    const amount = -consumption.amount;
    const balanceAfter = currentBalance + amount;
    const entry = createAoCreditLedgerEntry({
      id: this.nextId(),
      organizationId: input.organizationId,
      type: AoCreditMovementType.Reversal,
      amount,
      balanceAfter,
      tenderId: input.tenderId,
      reason: input.reason,
      actorPlatformAdministratorId: input.actorPlatformAdministratorId,
      occurredAt: input.occurredAt,
    });
    this.balances.set(input.organizationId, balanceAfter);
    this.entries.push(entry);
    return entry;
  }

  async findConsumptionByTenderId(organizationId: string, tenderId: string): Promise<AoCreditLedgerEntry | null> {
    return this.entries.find((e) => e.organizationId === organizationId && e.type === AoCreditMovementType.Consumption && e.tenderId === tenderId) ?? null;
  }

  async findGrantByPeriod(organizationId: string, period: string): Promise<AoCreditLedgerEntry | null> {
    return this.entries.find((e) => e.organizationId === organizationId && e.type === AoCreditMovementType.Grant && e.period === period) ?? null;
  }

  async list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<AoCreditLedgerPage> {
    const all = this.entries.filter((e) => e.organizationId === organizationId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    const startIndex = options.cursor ? all.findIndex((e) => e.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit + 1);
    const hasNextPage = page.length > options.limit;
    const items = hasNextPage ? page.slice(0, options.limit) : page;
    return { items, nextCursor: hasNextPage ? (items[items.length - 1]?.id ?? null) : null };
  }
}
