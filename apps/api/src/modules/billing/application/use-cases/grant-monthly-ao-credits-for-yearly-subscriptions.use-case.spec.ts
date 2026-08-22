import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { FIXED_NOW, InMemoryAoCreditLedgerRepository, InMemoryAuditLogWriter, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { GrantMonthlyAoCreditsUseCase } from "./grant-monthly-ao-credits.use-case";
import { GrantMonthlyAoCreditsForYearlySubscriptionsUseCase } from "./grant-monthly-ao-credits-for-yearly-subscriptions.use-case";

function clockAt(now: Date) {
  return { now: () => now };
}

async function withYearlySubscription(
  subscriptions: InMemoryOrganizationSubscriptionRepository,
  organizationId: string,
  planTier: string,
  options?: { status?: string; currentPeriodStart?: Date; occurredAt?: Date },
) {
  const subscription = OrganizationSubscription.create({
    id: `sub-${organizationId}`,
    organizationId,
    planTier: planTier as never,
    billingInterval: BillingInterval.Yearly,
    source: PlanSource.Stripe,
    currentPeriodStart: options?.currentPeriodStart,
    occurredAt: options?.occurredAt ?? FIXED_NOW,
  });
  if (options?.status === SubscriptionStatus.Canceled) subscription.cancel(FIXED_NOW);
  await subscriptions.save(subscription);
  return subscription;
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 2 (mois calendaire courant) puis E1.2, ANNUAL CREDIT
 * CATCHUP (mois manqués depuis le dernier grant valide / le début de la période d'abonnement) —
 * preuve que ce use case orchestrateur (déclenché périodiquement par `MonthlyAoCreditGrantWorker`,
 * jamais par `invoice.paid` seul) accorde bien CHAQUE mois dû, jamais seulement le mois courant.
 */
describe("GrantMonthlyAoCreditsForYearlySubscriptionsUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let ledger: InMemoryAoCreditLedgerRepository;
  let auditLog: InMemoryAuditLogWriter;

  function buildUseCase(now: Date): GrantMonthlyAoCreditsForYearlySubscriptionsUseCase {
    const grantMonthlyAoCreditsUseCase = new GrantMonthlyAoCreditsUseCase(subscriptions, ledger, auditLog);
    return new GrantMonthlyAoCreditsForYearlySubscriptionsUseCase(subscriptions, ledger, grantMonthlyAoCreditsUseCase, clockAt(now));
  }

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    ledger = new InMemoryAoCreditLedgerRepository();
    auditLog = new InMemoryAuditLogWriter();
  });

  it("grants the current calendar month to every ACTIVE yearly subscription (no prior grant, anchored on subscription start)", async () => {
    await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter);
    await withYearlySubscription(subscriptions, "org-b", PlanTier.Business);

    const result = await buildUseCase(FIXED_NOW).execute();

    expect(result).toEqual({ checked: 2, granted: 2, periodsGranted: 2 });
    expect(await ledger.getBalance("org-a")).toBe(2);
    expect(await ledger.getBalance("org-b")).toBe(10);
  });

  it("a second tick in the SAME calendar month never grants a NEW period (idempotent, job relaunch/double execution safe)", async () => {
    await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter);
    const useCase = buildUseCase(FIXED_NOW);

    await useCase.execute();
    const second = await useCase.execute();

    expect(second.periodsGranted).toBe(0);
    expect(await ledger.getBalance("org-a")).toBe(2);
    expect(auditLog.entries.filter((e) => e.action === "AoCreditsGranted")).toHaveLength(1);
  });

  it("never touches MONTHLY-billed subscriptions (out of scope — invoice.paid already covers them)", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-monthly", organizationId: "org-monthly", planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );

    const result = await buildUseCase(FIXED_NOW).execute();

    expect(result).toEqual({ checked: 0, granted: 0, periodsGranted: 0 });
    expect(await ledger.getBalance("org-monthly")).toBe(0);
  });

  it("skips a CANCELED yearly subscription without crashing the loop for the others", async () => {
    await withYearlySubscription(subscriptions, "org-canceled", PlanTier.Starter, { status: SubscriptionStatus.Canceled });
    await withYearlySubscription(subscriptions, "org-active", PlanTier.Business);

    const result = await buildUseCase(FIXED_NOW).execute();

    expect(result.checked).toBe(1); // listActiveOrTrialingYearly excludes CANCELED entirely
    expect(result.granted).toBe(1);
    expect(await ledger.getBalance("org-active")).toBe(10);
  });

  it("mission §14 — Enterprise (unlimited, plan change mid-cycle) is skipped, not treated as an error, and never blocks other organizations", async () => {
    await withYearlySubscription(subscriptions, "org-enterprise", PlanTier.Enterprise);
    await withYearlySubscription(subscriptions, "org-starter", PlanTier.Starter);

    const result = await buildUseCase(FIXED_NOW).execute();

    expect(result.checked).toBe(2);
    expect(result.granted).toBe(1);
    expect(await ledger.getBalance("org-starter")).toBe(2);
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.2 — ANNUAL CREDIT CATCHUP", () => {
    const JANUARY = new Date(Date.UTC(2026, 0, 15));
    const FEBRUARY = new Date(Date.UTC(2026, 1, 10));
    const MARCH = new Date(Date.UTC(2026, 2, 20));

    it("mission TEST 13 — January already granted, worker returns in March after a February absence: February AND March are both granted", async () => {
      // `occurredAt: JANUARY` — la ligne d'abonnement n'a JAMAIS été retouchée depuis janvier (même
      // plan/statut en continu), ce qui est PRÉCISÉMENT ce que la borne de certitude E1.3
      // (`periodOf(updatedAt)`) doit reconnaître comme sûr à rattraper jusqu'à mars.
      await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter, { currentPeriodStart: JANUARY, occurredAt: JANUARY });
      await buildUseCase(JANUARY).execute();
      expect(await ledger.getBalance("org-a")).toBe(2);

      const result = await buildUseCase(MARCH).execute();

      expect(result.periodsGranted).toBe(2); // February + March
      expect(await ledger.getBalance("org-a")).toBe(6); // 2 (Jan) + 2 (Feb) + 2 (Mar)
      expect(await ledger.findGrantByPeriod("org-a", "2026-02")).not.toBeNull();
      expect(await ledger.findGrantByPeriod("org-a", "2026-03")).not.toBeNull();
    });

    it("mission TEST 14 — relaunching the worker right after a catchup never duplicates February/March", async () => {
      await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter, { currentPeriodStart: JANUARY, occurredAt: JANUARY });
      await buildUseCase(JANUARY).execute();
      await buildUseCase(MARCH).execute();
      expect(await ledger.getBalance("org-a")).toBe(6);

      const relaunch = await buildUseCase(MARCH).execute();

      expect(relaunch.periodsGranted).toBe(0);
      expect(await ledger.getBalance("org-a")).toBe(6);
      expect(auditLog.entries.filter((e) => e.action === "AoCreditsGranted")).toHaveLength(3);
    });

    it("mission TEST 15 — a period already granted via invoice.paid (webhook) is never re-granted by the catchup worker for the SAME period", async () => {
      await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter, { currentPeriodStart: JANUARY, occurredAt: JANUARY });
      const grantMonthlyAoCreditsUseCase = new GrantMonthlyAoCreditsUseCase(subscriptions, ledger, auditLog);
      // Simule le webhook Stripe invoice.paid pour janvier, hors de l'orchestrateur.
      await grantMonthlyAoCreditsUseCase.execute({ organizationId: "org-a", period: "2026-01", actorId: "stripe-webhook", occurredAt: JANUARY });
      expect(await ledger.getBalance("org-a")).toBe(2);

      const result = await buildUseCase(JANUARY).execute();

      expect(result.periodsGranted).toBe(0);
      expect(await ledger.getBalance("org-a")).toBe(2);
    });

    it("mission TEST 16 — PAST_DUE grants nothing (organization currently non-entitled never reaches the catchup loop)", async () => {
      const subscription = OrganizationSubscription.create({ id: "sub-past-due", organizationId: "org-past-due", planTier: PlanTier.Starter, billingInterval: BillingInterval.Yearly, source: PlanSource.Stripe, currentPeriodStart: JANUARY, occurredAt: JANUARY });
      subscription.markPastDue(MARCH);
      await subscriptions.save(subscription);

      const result = await buildUseCase(MARCH).execute();

      expect(result.checked).toBe(0); // listActiveOrTrialingYearly excludes PAST_DUE
      expect(await ledger.getBalance("org-past-due")).toBe(0);
    });

    it("never grants a period before the subscription's currentPeriodStart", async () => {
      await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter, { currentPeriodStart: FEBRUARY, occurredAt: FEBRUARY });

      const result = await buildUseCase(FEBRUARY).execute();

      expect(result.periodsGranted).toBe(1);
      expect(await ledger.findGrantByPeriod("org-a", "2026-01")).toBeNull();
      expect(await ledger.findGrantByPeriod("org-a", "2026-02")).not.toBeNull();
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.3 — correctif Codex : le catch-up n'invente NI plan NI statut historique (OPTION B conservatrice, mission §14/§15/§16)", () => {
    const JANUARY = new Date(Date.UTC(2026, 0, 15));
    const FEBRUARY = new Date(Date.UTC(2026, 1, 10));
    const MARCH = new Date(Date.UTC(2026, 2, 20));

    it("mission §15 PLAN CHANGE — Starter en janvier (grant), Starter en février (rien de changé), upgrade Business en mars : le worker qui revient en mars ne rattrape JAMAIS février comme Business (ambigu, jamais inventé) — seul mars (période courante, prouvée Business) est accordé", async () => {
      // La ligne est créée en janvier (Starter), puis `changePlan` vers Business EST appelé en mars
      // (mission scénario) — `updatedAt` avance alors à mars, ce qui EST la preuve réelle disponible.
      const subscription = OrganizationSubscription.create({
        id: "sub-plan-change",
        organizationId: "org-plan-change",
        planTier: PlanTier.Starter,
        billingInterval: BillingInterval.Yearly,
        source: PlanSource.Stripe,
        currentPeriodStart: JANUARY,
        occurredAt: JANUARY,
      });
      await subscriptions.save(subscription);
      await buildUseCase(JANUARY).execute(); // grant janvier au tier réel de l'époque (Starter)
      expect(await ledger.getBalance("org-plan-change")).toBe(2);

      // Upgrade Business EN MARS (jamais en février — février reste Starter tout du long, mais le
      // modèle actuel ne peut pas le PROUVER rétroactivement, voir le commentaire de classe).
      subscription.changePlan({ planTier: PlanTier.Business, billingInterval: BillingInterval.Yearly, occurredAt: MARCH });
      await subscriptions.save(subscription);

      const result = await buildUseCase(MARCH).execute();

      // INTERDIT : février accordé comme Business (mission "interdit... grant février comme
      // Business simplement parce que Business est le plan courant").
      expect(await ledger.findGrantByPeriod("org-plan-change", "2026-02")).toBeNull();
      // Mars (la période courante, réellement Business depuis le début de son propre mois vue la
      // borne de certitude) reste accordé, correctement au tier Business.
      const marchGrant = await ledger.findGrantByPeriod("org-plan-change", "2026-03");
      expect(marchGrant).not.toBeNull();
      expect(marchGrant?.amount).toBe(10); // nominal Business, jamais Starter
      expect(result.periodsGranted).toBe(1); // uniquement mars, jamais février
    });

    it("mission §16 HISTORICAL STATUS — ACTIVE en janvier (grant), PAST_DUE en février, ACTIVE de nouveau en mars : le worker qui revient en mars n'accorde JAMAIS février automatiquement (aucune preuve historique de son entitlement)", async () => {
      const subscription = OrganizationSubscription.create({
        id: "sub-historical-status",
        organizationId: "org-historical-status",
        planTier: PlanTier.Starter,
        billingInterval: BillingInterval.Yearly,
        source: PlanSource.Stripe,
        currentPeriodStart: JANUARY,
        occurredAt: JANUARY,
      });
      await subscriptions.save(subscription);
      await buildUseCase(JANUARY).execute();
      expect(await ledger.getBalance("org-historical-status")).toBe(2);

      // PAST_DUE en février (jamais rattrapé pendant qu'il est en vigueur, déjà garanti par TEST 16
      // ci-dessus) — puis réactivé en MARS.
      subscription.markPastDue(FEBRUARY);
      await subscriptions.save(subscription);
      subscription.reactivate(MARCH);
      await subscriptions.save(subscription);

      const result = await buildUseCase(MARCH).execute();

      // INTERDIT : février accordé automatiquement (mission "interdit d'accorder automatiquement
      // février si aucune preuve historique ne démontre l'entitlement de février").
      expect(await ledger.findGrantByPeriod("org-historical-status", "2026-02")).toBeNull();
      expect(await ledger.findGrantByPeriod("org-historical-status", "2026-03")).not.toBeNull();
      expect(result.periodsGranted).toBe(1); // uniquement mars
    });

    it("mission §17 ROLLOVER CAP — un rattrapage multi-mois ne contourne jamais le cap (Starter : 2/mois, cap 6)", async () => {
      // 3 mois manqués d'un coup (janvier à mars), jamais retouchée depuis janvier — rattrapage
      // complet légitime, mais le solde ne doit jamais dépasser le cap de 6 malgré 3x2=6 nominal
      // tombant PILE sur le cap ici ; le test suivant pousse au-delà pour prouver l'écrêtage réel.
      await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter, { currentPeriodStart: JANUARY, occurredAt: JANUARY });

      const result = await buildUseCase(MARCH).execute();

      expect(result.periodsGranted).toBe(3);
      expect(await ledger.getBalance("org-a")).toBe(6); // jamais au-delà du cap Starter
    });

    it("mission §17 ROLLOVER CAP — un rattrapage multi-mois qui dépasserait nominalement le cap reste STRICTEMENT plafonné (jamais contourné par le catch-up)", async () => {
      const APRIL = new Date(Date.UTC(2026, 3, 5));
      await withYearlySubscription(subscriptions, "org-a", PlanTier.Starter, { currentPeriodStart: JANUARY, occurredAt: JANUARY });
      // Un ajustement manuel porte déjà le solde à 5 avant le rattrapage (mission — le cap doit
      // rester respecté même en partant d'un solde proche du plafond, jamais recalculé "à vide").
      await ledger.adjust({ organizationId: "org-a", amount: 5, reason: "test fixture", actorPlatformAdministratorId: "admin-1", occurredAt: JANUARY });

      // 4 mois dus (janvier à avril) à 2/mois = 8 nominal, cap Starter = 6.
      const result = await buildUseCase(APRIL).execute();

      expect(result.periodsGranted).toBe(4);
      expect(await ledger.getBalance("org-a")).toBe(6); // jamais 5+8=13, toujours plafonné à 6
    });

    it("mission §17 ROLLOVER CAP — Business (10/mois, cap 60) : un rattrapage multi-mois reste plafonné à 60", async () => {
      const DECEMBER = new Date(Date.UTC(2026, 11, 1));
      await withYearlySubscription(subscriptions, "org-b", PlanTier.Business, { currentPeriodStart: JANUARY, occurredAt: JANUARY });

      // 12 mois dus (janvier à décembre) à 10/mois = 120 nominal, cap Business = 60.
      const result = await buildUseCase(DECEMBER).execute();

      expect(result.periodsGranted).toBe(12);
      expect(await ledger.getBalance("org-b")).toBe(60); // jamais 120, toujours plafonné à 60
    });
  });
});
