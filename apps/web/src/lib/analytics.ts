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
 *  simplement pour Analytics") — seul `analytics_storage` peut passer à `granted`. */
export function applyConsentToGtag(analyticsGranted: boolean): void {
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
  OnboardingCompleted: "onboarding_completed",
} as const;
export type GaEventName = (typeof GA_EVENTS)[keyof typeof GA_EVENTS];

export type GaEventParams = Readonly<Record<string, string | number | boolean>>;

/** Sans script GA4 monté (pas de consentement, ou `NEXT_PUBLIC_GA_MEASUREMENT_ID` absent), un
 *  no-op silencieux — jamais un crash (mission §63 "Landing doit fonctionner normalement"). */
export function trackEvent(name: GaEventName, params?: GaEventParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}
