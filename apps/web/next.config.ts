import type { NextConfig } from "next";

/** Sprint 21 (hardening) — mission §11, aucun en-tête de sécurité n'existait nulle part dans la
 *  pile (ni API ni web). Volontairement modéré (jamais une CSP agressive qui casserait
 *  l'application, mission "ne pas casser l'application avec une CSP trop agressive") : `'self'`
 *  couvre le cas d'usage réel (Next.js sert ses propres scripts/styles same-origin), `frame-ancestors
 *  'none'` bloque le clickjacking sans dépendre de X-Frame-Options (obsolète face à CSP mais gardé
 *  en double pour les anciens navigateurs).
 *
 *  V2 Sprint 23 (landing) — `Content-Security-Policy` retiré de ce bloc COMMUN, mission §52 "ne
 *  jamais script-src *". La Landing (GA4/Crisp) a besoin d'une politique plus permissive que
 *  `/app`/`/platform-admin` — deux CSP DIFFÉRENTES sont nécessaires. Next.js applique TOUS les
 *  blocs `headers()` dont le `source` matche une requête (jamais "premier match gagne") : envoyer
 *  DEUX en-têtes `Content-Security-Policy` sur la même réponse ferait que le navigateur applique
 *  l'INTERSECTION des deux (la plus stricte gagne toujours), cassant silencieusement GA4/Crisp
 *  malgré une politique "marketing" en apparence correcte. Chaque route ne reçoit donc CSP que
 *  d'un seul bloc, explicitement partitionné (COMMON_HEADERS n'en contient plus). */
const COMMON_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// V2 Sprint 23 (landing, correctif trouvé en testant réellement en conditions Playwright, pas
// seulement en compilant) — `next dev` (Fast Refresh/Webpack HMR) enveloppe chaque module dans un
// `eval(...)` pour les source maps, une exigence documentée de Next.js lui-même en développement.
// Sans `'unsafe-eval'`, le navigateur lève une violation CSP qui empêche silencieusement TOUT
// gestionnaire d'événement React de s'exécuter (constaté : le clic sur "Tout refuser" n'écrivait
// jamais dans localStorage, la bannière restait affichée indéfiniment) — un bug latent qui touchait
// déjà `/app`/`/platform-admin` depuis Sprint 21, simplement jamais détecté faute d'avoir vérifié
// les erreurs console dans un test E2E réel. JAMAIS en production (`next build` compile en dur,
// aucun eval nécessaire) — n'affaiblit donc jamais la CSP réellement servie aux utilisateurs.
const UNSAFE_EVAL_IN_DEV = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const APP_CSP =
  `default-src 'self'; script-src 'self' 'unsafe-inline'${UNSAFE_EVAL_IN_DEV}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;

/** V2 Sprint 23 (landing) — UNIQUEMENT les domaines strictement nécessaires à GA4/Crisp (mission
 *  §52), jamais un `script-src *`/`connect-src *`. `client.crisp.chat` couvre à la fois le script
 *  et les appels API/WebSocket du widget (le domaine WebSocket réel de Crisp est un sous-domaine
 *  de `relay.crisp.chat`, ajouté explicitement plutôt que d'élargir `client.crisp.chat` en `*`). */
const MARKETING_CSP =
  `default-src 'self'; ` +
  `script-src 'self' 'unsafe-inline'${UNSAFE_EVAL_IN_DEV} https://www.googletagmanager.com https://client.crisp.chat; ` +
  `style-src 'self' 'unsafe-inline' https://client.crisp.chat; ` +
  `img-src 'self' data: blob: https://www.google-analytics.com https://client.crisp.chat; ` +
  `font-src 'self' data: https://client.crisp.chat; ` +
  `connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://client.crisp.chat wss://client.relay.crisp.chat; ` +
  `frame-src https://client.crisp.chat; ` +
  `frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;

/** V2 Sprint 24 (onboarding) — le wizard a besoin de GA4 (mission : événements du funnel) mais
 *  JAMAIS de Crisp (aucun widget de chat sur ce parcours, mission "CSP limitée aux scripts
 *  réellement nécessaires") : une troisième politique, plus stricte que MARKETING_CSP sur ce seul
 *  point, jamais un simple réemploi de MARKETING_CSP par commodité. L'étape "Paiement" redirige
 *  vers Stripe Checkout via `window.location.href` (même motif que `CheckoutButton` existant sous
 *  `/app`), une navigation top-level jamais régie par `form-action` — aucun domaine Stripe à
 *  ajouter ici, exactement comme APP_CSP ne l'a jamais fait pour ce même mécanisme. */
const ONBOARDING_CSP =
  `default-src 'self'; ` +
  `script-src 'self' 'unsafe-inline'${UNSAFE_EVAL_IN_DEV} https://www.googletagmanager.com; ` +
  `style-src 'self' 'unsafe-inline'; ` +
  `img-src 'self' data: blob: https://www.google-analytics.com; ` +
  `font-src 'self' data:; ` +
  `connect-src 'self' https://www.google-analytics.com https://analytics.google.com; ` +
  `frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;

/** V2 Sprint 25 (mission §25.92 "GA4 / PRODUCT EVENTS") — correctif audit Codex Checkpoint 25E
 *  (P1) : `AuthenticatedAnalyticsLoader` charge GA4 sur `/app/*` (jamais Crisp — même discipline
 *  qu'ONBOARDING_CSP) pour que `product_tour_started/completed`/`starter_trial_started/conversion`/
 *  `first_tender_started` puissent réellement partir. `/platform-admin/*` reste sur `APP_CSP`
 *  strict inchangé (aucun besoin produit GA4 côté Platform Admin, jamais élargi sans raison). */
const APP_CSP_WITH_GA4 =
  `default-src 'self'; ` +
  `script-src 'self' 'unsafe-inline'${UNSAFE_EVAL_IN_DEV} https://www.googletagmanager.com; ` +
  `style-src 'self' 'unsafe-inline'; ` +
  `img-src 'self' data: blob: https://www.google-analytics.com; ` +
  `font-src 'self' data:; ` +
  `connect-src 'self' https://www.google-analytics.com https://analytics.google.com; ` +
  `frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Le lint est un script dédié (`pnpm lint`, eslint.config.mjs à la racine du monorepo) ;
  // éviter une double exécution (et une détection de plugin en flat config non fiable) ici.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const hstsInProd = process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : [];
    return [
      // Baseline (jamais de CSP ici, voir le commentaire ci-dessus) — appliqué à toute réponse,
      // y compris les assets statiques (favicons, manifest, robots.txt, sitemap.xml).
      { source: "/:path*", headers: [...COMMON_HEADERS, ...hstsInProd] },
      // Surface authentifiée — V2 Sprint 25 : GA4 autorisé (voir APP_CSP_WITH_GA4 ci-dessus),
      // jamais Crisp. Platform Admin reste sur APP_CSP strict, inchangé depuis Sprint 21.
      { source: "/app/:path*", headers: [{ key: "Content-Security-Policy", value: APP_CSP_WITH_GA4 }] },
      { source: "/platform-admin/:path*", headers: [{ key: "Content-Security-Policy", value: APP_CSP }] },
      // Surface marketing publique (mission §2) — SEULES routes autorisées à charger GA4/Crisp.
      { source: "/", headers: [{ key: "Content-Security-Policy", value: MARKETING_CSP }] },
      { source: "/contact", headers: [{ key: "Content-Security-Policy", value: MARKETING_CSP }] },
      { source: "/a-propos", headers: [{ key: "Content-Security-Policy", value: MARKETING_CSP }] },
      // V2 Sprint 25 (Pricing dédié) — mission §25.32 : nouvelle route publique, même politique que
      // les autres pages marketing (GA4 pour le suivi Pricing, jamais de CSP par défaut trop
      // permissive — voir le commentaire au sommet de ce fichier sur le partitionnement CSP).
      { source: "/pricing", headers: [{ key: "Content-Security-Policy", value: MARKETING_CSP }] },
      { source: "/legal/:path*", headers: [{ key: "Content-Security-Policy", value: MARKETING_CSP }] },
      // V2 Sprint 24 (onboarding) — GA4 mais jamais Crisp, voir ONBOARDING_CSP.
      { source: "/onboarding/:path*", headers: [{ key: "Content-Security-Policy", value: ONBOARDING_CSP }] },
    ];
  },
};

export default nextConfig;
