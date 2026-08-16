// V2 Sprint 25 (Trial Starter) — miroir frontend de `apps/api/.../billing/domain/trial-policy.ts`
// (mission §25.6 "Ne pas répéter arbitrairement `14`" : Landing, Pricing, Onboarding, Dashboard
// doivent tous dériver de cette SEULE constante, jamais un `14` recopié à la main ailleurs).

export const STARTER_TRIAL_DAYS = 14;

/** Projection affichée AVANT tout Checkout réel (mission §25.5 "la date vient du backend/Stripe") —
 *  cette page publique n'a pas encore de Subscription Stripe existante à interroger : la date
 *  affichée est donc une PROJECTION ("si vous démarrez aujourd'hui"), calculée à partir de la même
 *  policy que le backend, jamais une valeur Stripe réelle. Une fois le Trial réellement démarré,
 *  seule la date `trialEndsAt` renvoyée par Stripe/webhook fait foi (bannière Dashboard, Sprint 25C). */
export function formatProjectedTrialEndDate(from: Date = new Date()): string {
  const end = new Date(from);
  end.setDate(end.getDate() + STARTER_TRIAL_DAYS);
  return end.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
