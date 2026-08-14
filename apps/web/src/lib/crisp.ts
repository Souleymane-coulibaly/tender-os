// V2 Sprint 23 (landing) — mission §29 "Centraliser dans lib/crisp, pas de script dupliqué". Le
// widget lui-même n'est monté (via `CrispLoader`, next/script) QU'APRÈS consentement Support
// accordé (mission §30). Contrairement à GA4, Crisp n'expose pas d'API de "retrait" propre une fois
// chargé (widget injecté dans le DOM, pas de simple flag à inverser) — un retrait de consentement
// Support déclenche donc un rechargement complet de la page (voir `ConsentProvider`), seule façon
// fiable de garantir qu'aucune trace du widget ne subsiste (mission §62).

export const CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
