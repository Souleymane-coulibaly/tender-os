/**
 * V2 Sprint 22 (billing, étape 22C) — mission "idempotence webhook Stripe... P1 si possible". Même
 * motif que `SignatureProviderEventRepository` (module `signature`) : idempotence via une
 * contrainte unique réelle sur l'identifiant d'événement Stripe.
 *
 * Correctif audit Codex 22C (P1-01) — `RECEIVED`/`PROCESSED`/`FAILED` (jamais un simple booléen
 * "déjà vu") : un événement qui a échoué (erreur transitoire, bug corrigé depuis) doit rester
 * REJOUABLE par le prochain retry Stripe pour le MÊME `stripeEventId`, jamais bloqué à jamais
 * derrière une contrainte unique déjà consommée. Seul un événement `PROCESSED` (succès réel) est
 * un doublon silencieux ; un événement `FAILED` redevient `RECEIVED` de façon atomique
 * (compare-and-set, même motif que `consume()`, Sprint 21/22B) pour éviter que deux retries
 * simultanés ne rejouent tous les deux le traitement métier.
 */
export type StripeEventRecordOutcome =
  | Readonly<{ outcome: "NEW"; recordId: string }>
  | Readonly<{ outcome: "RETRY"; recordId: string }>
  | Readonly<{ outcome: "SKIP" }>;

export interface StripeProcessedEventRepository {
  recordForProcessing(input: { id: string; stripeEventId: string; eventType: string; receivedAt: Date }): Promise<StripeEventRecordOutcome>;
  markProcessed(input: { id: string; occurredAt: Date }): Promise<void>;
  markFailed(input: { id: string; errorCode: string }): Promise<void>;
}

export const STRIPE_PROCESSED_EVENT_REPOSITORY = Symbol("STRIPE_PROCESSED_EVENT_REPOSITORY");
