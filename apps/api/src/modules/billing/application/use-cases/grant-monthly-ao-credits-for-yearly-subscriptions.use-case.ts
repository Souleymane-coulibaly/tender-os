import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AoCreditGrantNotApplicableError } from "../../domain/errors";
import type { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { GrantMonthlyAoCreditsUseCase } from "./grant-monthly-ao-credits.use-case";

export type GrantMonthlyAoCreditsForYearlySubscriptionsResult = Readonly<{ checked: number; granted: number; periodsGranted: number }>;

/** Nombre maximal de mois rattrapés en un seul tick — garde-fou défensif (jamais un besoin réel :
 *  même un worker resté indisponible plusieurs années resterait sous ce plafond), jamais un
 *  rattrapage illimité qui masquerait une anomalie de calcul d'ancre par une boucle sans fin. */
const MAX_CATCHUP_PERIODS = 36;

/** "YYYY-MM" en UTC — même format et même calcul que `periodOf` (`handle-stripe-webhook.use-case.ts`). */
function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, 1)); // month is already 1-indexed input -> +1 mois
  return periodOf(next);
}

/** Comparaison lexicographique valide sur "YYYY-MM" zero-paddé (même motif que `periodsFromTo`). */
function maxPeriod(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Toutes les périodes de `from` (inclus) à `to` (inclus), dans l'ordre chronologique — comparaison
 *  et boucle sur des chaînes "YYYY-MM" zero-paddées, jamais un calcul de date approximatif. */
function periodsFromTo(from: string, to: string): string[] {
  const periods: string[] = [];
  let cursor = from;
  while (cursor <= to && periods.length < MAX_CATCHUP_PERIODS) {
    periods.push(cursor);
    cursor = nextPeriod(cursor);
  }
  return periods;
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 2 — Stripe ne produit normalement PAS 12 événements
 * `invoice.paid` mensuels pour un abonnement annuel (une seule facture initiale, puis plus rien
 * avant le renouvellement un an plus tard) : `HandleStripeWebhookUseCase` (le seul déclencheur
 * existant de `GrantMonthlyAoCreditsUseCase` avant E1.1) ne couvre donc QUE le premier mois d'un
 * abonnement annuel, jamais les 11 suivants. Ce use case orchestrateur (même motif que
 * `SendTrialRemindersUseCase`) est le déclencheur PÉRIODIQUE manquant — invoqué par
 * `MonthlyAoCreditGrantWorker`.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E1.2, ANNUAL CREDIT CATCHUP — correctif du gap identifié par l'audit
 * Codex E1.1-AUDIT : la version E1.1 ne grantait QUE le mois calendaire COURANT à chaque tick,
 * jamais les mois manqués pendant une indisponibilité du worker (mission "un client annuel ne doit
 * jamais perdre un mois de crédits AO parce que le worker était indisponible"). Détermine désormais,
 * pour CHAQUE organisation, l'ensemble des périodes DUES depuis le dernier grant valide (ou depuis
 * le début de la période d'abonnement si aucun grant n'a jamais eu lieu — `currentPeriodStart`,
 * jamais avant), jusqu'au mois calendaire courant INCLUS, et les accorde une par une, dans l'ordre
 * chronologique. Idempotent PAR CONSTRUCTION, période par période, via
 * `GrantMonthlyAoCreditsUseCase`/`AoCreditLedgerRepository.grant()` (clé logique organizationId +
 * period + GRANT, index unique partiel) — un rejeu de job, une double exécution, ou un
 * `invoice.paid` couvrant la MÊME période qu'un rattrapage déjà passé ne créditent jamais deux fois
 * le même mois (TEST 13-15).
 *
 * Respect ACTIVE/TRIALING/PAST_DUE/CANCELED (mission §6) : `listActiveOrTrialingYearly()` ne
 * retourne QUE les organisations CURRENTLY entitled — une organisation actuellement PAST_DUE ou
 * CANCELED n'atteint jamais cette boucle, donc ne reçoit JAMAIS de rattrapage pendant que ce statut
 * est en vigueur.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §14/§15/§16 — correctif du finding Codex E1.2-AUDIT :
 * la version E1.2 rattrapait TOUJOURS au palier/statut COURANT, y compris pour des mois où
 * l'organisation avait potentiellement un AUTRE plan ou un AUTRE statut (ex. Starter en février,
 * upgrade Business en mars ; ou PAST_DUE en février, réactivée en mars) — sur-crédit possible d'un
 * plan/statut jamais réellement en vigueur pour le mois concerné.
 *
 * AUDIT du modèle actuel (mission §14, avant tout choix d'implémentation) : `OrganizationSubscription`
 * est une ligne mutable UNIQUE par organisation (`changePlan`/`reassign`/`updateFromStripeStatus`/
 * `markPastDue`/`reactivate`/`cancel` mutent tous la MÊME ligne) — aucune table d'historique
 * structuré par période n'existe (`SubscriptionPlanHistory`/`SubscriptionEntitlementPeriod`, OPTION A
 * de la mission). La créer aurait exigé d'instrumenter CHAQUE mutation d'abonnement (au moins 6 use
 * cases across `assign-subscription`/`cancel-subscription`/`mark-subscription-past-due`/
 * `handle-stripe-webhook`) pour écrire une ligne d'historique à chaque transition, sans aucune
 * garantie qu'un futur appelant respecte cette discipline — une refonte disproportionnée pour ce
 * Checkpoint (mission §14 "STOP avant refonte disproportionnée").
 *
 * OPTION B retenue (rattrapage CONSERVATEUR) — SANS AUCUN nouveau schéma : `OrganizationSubscription.
 * updatedAt` est DÉJÀ mis à jour par CHACUNE de ces mutations existantes. Le fait "cette ligne a
 * exactement cette valeur (planTier/status) de façon CONTINUE depuis `updatedAt`" est donc une
 * information déjà réellement disponible, jamais inventée. Périodes réellement rattrapées :
 * `[max(nextPeriod(dernierGrantValide) OU début d'abonnement, periodOf(updatedAt)) ; moisCourant]` —
 * jamais avant `updatedAt` (aucune garantie que le plan/statut courant s'appliquait avant cette
 * date), jamais avant le début réel de l'abonnement, jamais deux fois le même mois. Un mois "ambigu"
 * (avant `updatedAt`, où le plan/statut a PU être différent) n'est JAMAIS rattrapé — conforme à la
 * préférence explicite de la mission "il vaut mieux ne pas accorder automatiquement un mois ambigu
 * que sur-créditer avec un tier/statut inventé" (TEST §15 Starter/Starter/Business : février reste
 * ambigu, jamais grant Business ; TEST §16 ACTIVE/PAST_DUE/ACTIVE : février reste ambigu, jamais
 * grant automatique). Effet de bord accepté et documenté (KNOWN_GAPS du rapport) : un simple
 * rafraîchissement Stripe des dates de période (`customer.subscription.updated` sans changement réel
 * de plan/statut) avance aussi `updatedAt`, pouvant réduire une fenêtre de rattrapage légitime — un
 * FAUX-CONSERVATEUR (mois non rattrapé alors qu'il aurait pu l'être), jamais un sur-crédit (le seul
 * risque que la mission interdit explicitement).
 */
@Injectable()
export class GrantMonthlyAoCreditsForYearlySubscriptionsUseCase {
  private readonly logger = new Logger(GrantMonthlyAoCreditsForYearlySubscriptionsUseCase.name);

  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    private readonly grantMonthlyAoCreditsUseCase: GrantMonthlyAoCreditsUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<GrantMonthlyAoCreditsForYearlySubscriptionsResult> {
    const subscriptions = await this.subscriptionRepository.listActiveOrTrialingYearly();
    const now = this.clock.now();
    const currentPeriod = periodOf(now);
    let granted = 0;
    let periodsGranted = 0;

    for (const subscription of subscriptions) {
      try {
        const duePeriods = await this.computeDuePeriods(subscription, currentPeriod);
        let anyGrantedThisOrg = false;
        for (const period of duePeriods) {
          const { alreadyApplied } = await this.grantMonthlyAoCreditsUseCase.execute({
            organizationId: subscription.organizationId,
            period,
            actorId: "system-monthly-grant-worker",
            occurredAt: now,
          });
          if (!alreadyApplied) {
            periodsGranted += 1;
            anyGrantedThisOrg = true;
          }
        }
        if (anyGrantedThisOrg || duePeriods.length > 0) {
          granted += 1;
        }
      } catch (error) {
        if (error instanceof AoCreditGrantNotApplicableError) {
          // Palier ILLIMITÉ (ex. passage à Enterprise en cours de cycle annuel) — jamais une erreur,
          // simplement rien à accorder pour cette organisation.
          continue;
        }
        // Ne bloque jamais les autres organisations pour un échec isolé (même discipline que les
        // autres workers `setInterval` de ce dépôt, ex. `SendTrialRemindersUseCase`).
        this.logger.error(`Monthly AO credit catchup failed for organization ${subscription.organizationId}.`, error instanceof Error ? error.stack : String(error));
      }
    }

    return { checked: subscriptions.length, granted, periodsGranted };
  }

  /** Périodes DUES pour cette organisation, du dernier grant (exclu, +1 mois) OU du début de la
   *  période d'abonnement (inclus, jamais avant) jusqu'au mois courant (inclus) — jamais non plus
   *  avant `periodOf(subscription.updatedAt)` (mission §14/§15/§16, OPTION B conservatrice : voir le
   *  commentaire de classe). */
  private async computeDuePeriods(subscription: OrganizationSubscription, currentPeriod: string): Promise<string[]> {
    const props = subscription.toProps();
    // Borne de certitude : le plan/statut COURANT n'est garanti en vigueur que DEPUIS cette date
    // (dernière mutation réelle de la ligne, mission §14 "ne jamais inventer un historique") — jamais
    // une période antérieure, même si elle serait autrement "due".
    const certaintyBoundary = periodOf(props.updatedAt);

    const latestGrantPeriod = await this.ledgerRepository.findLatestGrantPeriod(subscription.organizationId);
    if (latestGrantPeriod !== null) {
      const start = maxPeriod(nextPeriod(latestGrantPeriod), certaintyBoundary);
      return start <= currentPeriod ? periodsFromTo(start, currentPeriod) : [];
    }

    // Aucun grant n'a jamais eu lieu — ancre sur le début réel de la période d'abonnement (jamais
    // avant), avec repli sur `createdAt` de la ligne d'abonnement si `currentPeriodStart` est absent
    // (source MANUAL/GRANTED, mission — jamais un abonnement STRIPE réel dans ce cas).
    const anchor = props.currentPeriodStart ?? props.createdAt;
    const start = maxPeriod(periodOf(anchor), certaintyBoundary);
    return start <= currentPeriod ? periodsFromTo(start, currentPeriod) : [];
  }
}
