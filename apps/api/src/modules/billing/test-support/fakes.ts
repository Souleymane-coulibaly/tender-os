import type { Clock } from "../../../shared-kernel/clock";
import { AoCreditMovementType } from "../domain/ao-credit-movement-type";
import { createAoCreditLedgerEntry, type AoCreditLedgerEntry } from "../domain/ao-credit-ledger-entry";
import type { EntitlementFeature } from "../domain/entitlement-feature";
import { EntitlementOverride } from "../domain/entitlement-override.aggregate";
import { AoCreditAdjustmentWouldGoNegativeError, AoCreditConsumptionAlreadyReversedError, AoCreditLedgerEntryNotFoundError, StripeWebhookSignatureInvalidError } from "../domain/errors";
import { PassPurchaseStatus } from "../domain/pass-purchase-status";
import type { QuotaType } from "../domain/quota-type";
import type { OrganizationSubscription } from "../domain/organization-subscription.aggregate";
import { PassPurchase } from "../domain/pass-purchase.aggregate";
import { SubscriptionStatus } from "../domain/subscription-status";
import type { AoCreditLedgerPage, AoCreditLedgerRepository } from "../application/ports/ao-credit-ledger.repository";
import type { AuditLogWriter, BillingAuditLogEntry } from "../application/ports/audit-log-writer";
import type { EntitlementOverridePage, EntitlementOverrideRepository } from "../application/ports/entitlement-override.repository";
import type { OrganizationSubscriptionRepository } from "../application/ports/organization-subscription.repository";
import type { QuotaAlertRepository } from "../application/ports/quota-alert.repository";
import type { TrialReminderRepository } from "../application/ports/trial-reminder.repository";
import {
  PassPurchaseExternalReferenceConflictError,
  type PassPurchasePage,
  type PassPurchaseRepository,
} from "../application/ports/pass-purchase.repository";
import type { CreateStripeCheckoutSessionInput, StripeClient, StripeWebhookEvent } from "../application/ports/stripe-client";
import type { StripeEventRecordOutcome, StripeProcessedEventRepository } from "../application/ports/stripe-processed-event.repository";

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

/** V2 Sprint 22 (billing, étape 22E) — même motif que `workspace/test-support/fakes.ts`
 *  `FakeOutboxWriter` : jamais un vrai worker Outbox en test unitaire, seule la capture des
 *  événements écrits importe pour vérifier QUOI est émis (type, payload), jamais leur livraison. */
export type CapturedOutboxEvent = Readonly<{ eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }>;

export class FakeOutboxWriter {
  readonly events: CapturedOutboxEvent[] = [];
  async write(input: { organizationId: string; events: readonly CapturedOutboxEvent[] }): Promise<void> {
    this.events.push(...input.events);
  }
}

/** V2 Sprint 22 (billing, étape 22E) — reproduit fidèlement la contrainte unique réelle
 *  `(organizationId, quotaType, threshold, periodKey)` de `PrismaQuotaAlertRepository`. */
export class InMemoryQuotaAlertRepository implements QuotaAlertRepository {
  private readonly seen = new Set<string>();

  async recordIfNew(input: { organizationId: string; quotaType: string; threshold: number; periodKey: string }): Promise<boolean> {
    const key = `${input.organizationId}:${input.quotaType}:${input.threshold}:${input.periodKey}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

/** V2 Sprint 25 (Trial Starter) — reproduit fidèlement la contrainte unique réelle
 *  `(organizationId, daysRemaining)` de `PrismaTrialReminderRepository`, même motif que
 *  `InMemoryQuotaAlertRepository`. */
export class InMemoryTrialReminderRepository implements TrialReminderRepository {
  private readonly seen = new Set<string>();

  async recordIfNotSent(input: { organizationId: string; daysRemaining: number; occurredAt: Date }): Promise<boolean> {
    const key = `${input.organizationId}:${input.daysRemaining}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
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

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<OrganizationSubscription | null> {
    for (const subscription of this.byOrganizationId.values()) {
      if (subscription.toProps().stripeSubscriptionId === stripeSubscriptionId) {
        return subscription;
      }
    }
    return null;
  }

  async save(subscription: OrganizationSubscription): Promise<void> {
    this.byOrganizationId.set(subscription.organizationId, subscription);
  }

  async listTrialing(): Promise<OrganizationSubscription[]> {
    return Array.from(this.byOrganizationId.values()).filter((s) => s.status === SubscriptionStatus.Trialing);
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

  async grantTrial(input: { organizationId: string; occurredAt: Date }): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }> {
    const existing = this.entries.find((e) => e.organizationId === input.organizationId && e.type === AoCreditMovementType.TrialGrant);
    if (existing) {
      return { entry: existing, alreadyApplied: true };
    }

    const currentBalance = this.balances.get(input.organizationId) ?? 0;
    const balanceAfter = currentBalance + 1;
    const entry = createAoCreditLedgerEntry({
      id: this.nextId(),
      organizationId: input.organizationId,
      type: AoCreditMovementType.TrialGrant,
      amount: 1,
      balanceAfter,
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

/** V2 Sprint 22 (billing, étape 22C) — jamais un vrai appel Stripe en test. `constructWebhookEvent`
 *  parse directement le corps JSON brut (au lieu d'une vraie vérification cryptographique) — le
 *  sentinel `signatureHeader === "invalid-signature"` simule un échec de vérification, même motif
 *  que les autres fakes de providers externes de ce dépôt (email/IA/OAuth). */
export class FakeStripeClient implements StripeClient {
  private sequence = 0;
  readonly checkoutSessionCalls: CreateStripeCheckoutSessionInput[] = [];
  readonly portalSessionCalls: { stripeCustomerId: string; returnUrl: string }[] = [];

  async createCheckoutSession(input: CreateStripeCheckoutSessionInput): Promise<{ sessionId: string; url: string }> {
    this.checkoutSessionCalls.push(input);
    this.sequence += 1;
    const sessionId = `cs_test_${this.sequence}`;
    return { sessionId, url: `https://checkout.stripe.test/${sessionId}` };
  }

  async createCustomerPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<{ url: string }> {
    this.portalSessionCalls.push(input);
    return { url: `https://billing.stripe.test/session/${input.stripeCustomerId}` };
  }

  constructWebhookEvent(rawBody: Buffer, signatureHeader: string): StripeWebhookEvent {
    if (signatureHeader === "invalid-signature") {
      throw new StripeWebhookSignatureInvalidError();
    }
    const parsed = JSON.parse(rawBody.toString("utf8")) as { id: string; type: string; data: { object: unknown } };
    return { id: parsed.id, type: parsed.type, data: parsed.data.object };
  }
}

type StripeProcessedEventRecord = {
  id: string;
  eventType: string;
  receivedAt: Date;
  status: "RECEIVED" | "PROCESSED" | "FAILED";
  processedAt?: Date;
  errorCode?: string;
};

/** Correctif audit Codex 22C (P1-01) — même discipline de section critique SYNCHRONE que les autres
 *  fakes ci-dessus : reproduit l'atomicité réelle de `recordForProcessing`
 *  (`PrismaStripeProcessedEventRepository`) sous `Promise.all` concurrent — un événement `FAILED`
 *  redevient rejouable (`RETRY`), un événement `PROCESSED` reste un doublon silencieux (`SKIP`). */
export class InMemoryStripeProcessedEventRepository implements StripeProcessedEventRepository {
  private readonly byStripeEventId = new Map<string, StripeProcessedEventRecord>();
  private readonly byId = new Map<string, string>();

  async recordForProcessing(input: { id: string; stripeEventId: string; eventType: string; receivedAt: Date }): Promise<StripeEventRecordOutcome> {
    const existing = this.byStripeEventId.get(input.stripeEventId);
    if (!existing) {
      this.byStripeEventId.set(input.stripeEventId, { id: input.id, eventType: input.eventType, receivedAt: input.receivedAt, status: "RECEIVED" });
      this.byId.set(input.id, input.stripeEventId);
      return { outcome: "NEW", recordId: input.id };
    }

    if (existing.status !== "FAILED") {
      return { outcome: "SKIP" };
    }

    delete existing.processedAt;
    delete existing.errorCode;
    existing.status = "RECEIVED";
    return { outcome: "RETRY", recordId: existing.id };
  }

  async markProcessed(input: { id: string; occurredAt: Date }): Promise<void> {
    const stripeEventId = this.byId.get(input.id);
    const record = stripeEventId ? this.byStripeEventId.get(stripeEventId) : undefined;
    if (record) {
      record.status = "PROCESSED";
      record.processedAt = input.occurredAt;
    }
  }

  async markFailed(input: { id: string; errorCode: string }): Promise<void> {
    const stripeEventId = this.byId.get(input.id);
    const record = stripeEventId ? this.byStripeEventId.get(stripeEventId) : undefined;
    if (record) {
      record.status = "FAILED";
      record.errorCode = input.errorCode;
    }
  }
}
