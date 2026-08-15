/**
 * V2 Sprint 22 (billing, étape 22C, correctif audit Codex P1-03) — même motif que `appBaseUrl()`
 * dans `ConnectorsOAuthCallbackController` : une URL de redirection finale (Stripe Checkout,
 * Customer Portal) est TOUJOURS `APP_BASE_URL` + un chemin FIXE, jamais construite depuis une
 * valeur fournie par le client (open redirect sinon — n'importe quel OWNER/ORGANIZATION_ADMIN
 * pourrait sinon rediriger un flux de paiement vers un domaine arbitraire).
 */
function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export type CheckoutReturnTarget = "settings" | "onboarding";

/** V2 Sprint 24 — correctif : ces chemins pointaient vers `/app/settings/billing`, une route qui
 *  n'existe pas (la page réelle est `/app/subscription`) — un paiement Stripe réussi aurait
 *  redirigé vers un 404. `returnTarget` optionnel ("onboarding") permet à l'étape "Paiement" du
 *  wizard onboarding de récupérer la main sur son propre écran de confirmation — toujours l'un de
 *  ces DEUX chemins fixes choisis côté serveur, jamais une URL fournie par le client (open
 *  redirect sinon, correctif audit Codex 22C P1-03 toujours respecté). */
export function appBillingReturnUrls(returnTarget: CheckoutReturnTarget = "settings"): { successUrl: string; cancelUrl: string } {
  const path = returnTarget === "onboarding" ? "/onboarding/paiement" : "/app/subscription";
  return {
    successUrl: `${appBaseUrl()}${path}?checkout=success`,
    cancelUrl: `${appBaseUrl()}${path}?checkout=canceled`,
  };
}

export function appCustomerPortalReturnUrl(): string {
  return `${appBaseUrl()}/app/subscription`;
}
