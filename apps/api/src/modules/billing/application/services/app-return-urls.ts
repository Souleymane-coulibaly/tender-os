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

export function appBillingReturnUrls(): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${appBaseUrl()}/app/settings/billing?checkout=success`,
    cancelUrl: `${appBaseUrl()}/app/settings/billing?checkout=canceled`,
  };
}

export function appCustomerPortalReturnUrl(): string {
  return `${appBaseUrl()}/app/settings/billing`;
}
