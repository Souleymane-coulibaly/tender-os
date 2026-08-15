/**
 * V2 Sprint 23A — liste des secteurs affichée sur le bandeau de la Landing (`TrustSection`).
 * V2 Sprint 24 — extraite ici pour être réutilisée telle quelle par l'étape "Configuration
 * initiale" de l'onboarding (mission : même liste que le bandeau secteurs, jamais une seconde
 * liste maintenue à la main).
 */
export const SECTORS = [
  "ESN",
  "Cabinets de conseil",
  "BTP",
  "Industrie",
  "Ingénierie",
  "Services",
  "Facilities Management",
  "Nettoyage industriel",
  "IT & Numérique",
  "Transport",
  "Énergie",
  "Maintenance",
  "Sécurité",
  "PME",
  "ETI",
] as const;

export type Sector = (typeof SECTORS)[number];
