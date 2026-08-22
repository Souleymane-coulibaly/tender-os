// V2 Sprint 23 (landing) — mission §33 "Pas de gtag dispersé dans les composants". Seul point
// d'accès à `window.gtag` de tout le frontend. Le script GA4 lui-même n'est monté (via
// `AnalyticsLoader`, next/script) QU'APRÈS consentement Analytics accordé (mission §34/§58/§59 —
// interprétation stricte "pas de dépôt de cookie avant consentement", plus prudente que le simple
// Consent Mode Google qui charge le script puis le "refuse"). `gtag('consent','default',...)` est
// quand même appelé au montage (mission §34, séquence documentée par Google), immédiatement suivi
// d'un `update` puisque le script n'est monté QUE lorsque le consentement est déjà acquis.

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
}

// Correctif réaudit Codex (Sprint 25E, 3e tour) — un premier correctif affectait `window.gtag = gtag`
// inconditionnellement au chargement du module pour que `trackEvent` cesse d'être un no-op muet en
// production. Codex a montré à raison que cela créait une VRAIE régression : `window.gtag` devenait
// alors atteignable AVANT tout consentement (cassant `tests/landing.spec.ts:58-79`, mission §58/§59
// "Analytics non initialisé avant consentement"), et `trackEvent` — appelé sans aucune garde de
// consentement locale par `site-header.tsx`/`tracked-link.tsx`/etc., qui ne faisaient QUE compter
// implicitement sur l'absence de `window.gtag` comme unique protection — pouvait alors pousser des
// événements dans `dataLayer` avant accord utilisateur.
//
// Le vrai correctif sépare les deux préoccupations : le consentement (état applicatif explicite,
// ci-dessous) et la disponibilité du script GA4 vendeur (dont l'existence de `window.gtag` n'a
// jamais été une condition réelle : la file d'attente `dataLayer` fonctionne dès que des entrées y
// sont poussées, script chargé ou non — c'est tout l'intérêt du motif `dataLayer.push`). `trackEvent`
// n'a donc plus besoin de `window.gtag` du tout : il pousse directement via `gtag()` ci-dessus,
// gardé par ce drapeau de consentement, jamais par la simple présence d'une fonction sur `window`.
let hasAnalyticsConsent = false;

/** Mission §34 — avant tout consentement, tout est `denied`. Appelé au montage du script GA4
 *  (donc seulement une fois le consentement Analytics déjà accordé, voir `AnalyticsLoader`), suivi
 *  immédiatement de `applyConsentToGtag`. */
export function setDefaultDeniedConsent(): void {
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

/** TenderOS n'active jamais les signaux Ads (mission §34 "pas besoin d'activer les fonctions Ads
 *  simplement pour Analytics") — seul `analytics_storage` peut passer à `granted`. Seul point qui
 *  fait réellement autorité sur "le consentement est accordé" pour `trackEvent` (voir plus bas) —
 *  jamais l'existence de `window.gtag` ou du script vendeur GA4. */
export function applyConsentToGtag(analyticsGranted: boolean): void {
  hasAnalyticsConsent = analyticsGranted;
  gtag("consent", "update", { analytics_storage: analyticsGranted ? "granted" : "denied" });
}

export function initGtagConfig(): void {
  if (!GA_MEASUREMENT_ID) return;
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });
}

/** Mission §35 — catalogue fermé, jamais un nom d'événement inventé au fil de l'eau dans un
 *  composant. Mission §36 — AUCUN champ ici ne doit jamais porter d'email/nom/SIRET/identifiant
 *  métier : seulement des libellés déjà publics (palier, intervalle de facturation). */
export const GA_EVENTS = {
  DemoCtaClicked: "demo_cta_clicked",
  PricingPlanSelected: "pricing_plan_selected",
  PassAoClicked: "pass_ao_clicked",
  LoginClicked: "login_clicked",
  ContactClicked: "contact_clicked",
  AnnualPricingSelected: "annual_pricing_selected",
  MonthlyPricingSelected: "monthly_pricing_selected",
  DemoRequestSubmitted: "demo_request_submitted",
  // V2 Sprint 24 (onboarding) — mission : funnel Onboarding, jamais un champ PII (email/nom/SIRET).
  OnboardingStarted: "onboarding_started",
  OnboardingAccountCompleted: "onboarding_account_completed",
  OnboardingOrganizationCompleted: "onboarding_organization_completed",
  OnboardingPlanSelected: "onboarding_plan_selected",
  CheckoutStarted: "checkout_started",
  // Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14 "Étape 6 — Équipe").
  OnboardingTeamStepViewed: "onboarding_team_step_viewed",
  OnboardingCompleted: "onboarding_completed",
  // V2 Sprint 25 (mission §25.92 "GA4 / PRODUCT EVENTS") — après consentement uniquement (même
  // moteur, `trackEvent` ci-dessous), aucune PII.
  PricingPageViewed: "pricing_page_viewed",
  StarterTrialSelected: "starter_trial_selected",
  StarterTrialStarted: "starter_trial_started",
  StarterTrialConversion: "starter_trial_conversion",
  ProductTourStarted: "product_tour_started",
  ProductTourCompleted: "product_tour_completed",
  FirstTenderStarted: "first_tender_started",
} as const;
export type GaEventName = (typeof GA_EVENTS)[keyof typeof GA_EVENTS];

export type GaEventParams = Readonly<Record<string, string | number | boolean>>;

/** Sans consentement Analytics accordé, un no-op silencieux — jamais un crash (mission §63 "Landing
 *  doit fonctionner normalement"), jamais un événement mis en file avant l'accord de l'utilisateur
 *  (mission §58/§59). Ne dépend plus de `window.gtag` (voir le commentaire au-dessus de
 *  `hasAnalyticsConsent`) : le consentement est le SEUL garde-fou, indépendant de l'état de
 *  chargement du script GA4 vendeur. */
export function trackEvent(name: GaEventName, params?: GaEventParams): void {
  if (typeof window === "undefined" || !hasAnalyticsConsent) return;
  gtag("event", name, params ?? {});
}
