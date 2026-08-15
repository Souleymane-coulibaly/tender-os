/**
 * Version courante des Conditions Générales d'Utilisation (CGU) — source de vérité UNIQUE
 * (V2 Sprint 24, onboarding). Jamais dupliquée ailleurs ni acceptée depuis une valeur fournie
 * par le client (RegisterUserUseCase stamp toujours CETTE constante, jamais une version envoyée
 * par le body de la requête). Un bump de cette valeur redemanderait l'acceptation aux comptes
 * existants — mécanisme non implémenté ce sprint (décision d'architecture volontaire, mission
 * CGU §24.17x : "seul un futur bump de version" redemande l'acceptation, jamais chaque connexion).
 */
export const TERMS_VERSION = "2026-08-15";
