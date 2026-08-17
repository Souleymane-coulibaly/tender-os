import type { Config } from "tailwindcss";

/**
 * V2 Sprint 23 (landing) — jetons de marque TenderOS (mission §7), premier design system du dépôt
 * (aucun token n'existait avant ce sprint, confirmé par audit). Couleurs exposées comme variables
 * CSS (`globals.css`) plutôt qu'en dur ici, pour rester la SEULE source de vérité — Tailwind ne fait
 * que les référencer via `var(--tenderos-*)`.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tenderos: {
          navy: "var(--tenderos-navy)",
          blue: "var(--tenderos-blue)",
          gold: "var(--tenderos-gold)",
          "gold-light": "var(--tenderos-gold-light)",
          slate: "var(--tenderos-slate)",
          light: "var(--tenderos-light)",
          white: "var(--tenderos-white)",
        },
        // Design System Checkpoint A — jetons sémantiques de statut (mission §6/§51), seule
        // addition de couleur de ce Checkpoint. Reproduisent EXACTEMENT les valeurs Tailwind déjà
        // utilisées partout (green/amber/red-100/-800) — jamais consommés par un composant existant
        // pour l'instant, donc zéro changement visuel actuel. Checkpoint B fera converger `Badge` et
        // les helpers `*BadgeClass()` dupliqués (goNoGoBadgeClass, scoreBadgeClass, etc., voir
        // rapport d'audit) vers `bg-success-bg text-success-fg` etc. plutôt que vers un 7e helper.
        success: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
        warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
        danger: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
        info: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
      },
      // Jamais la clé `sans` par défaut (remplacerait le corps de police de TOUTE l'application,
      // y compris /app et /platform-admin — non-régression §72). Deux clés nommées, appliquées
      // UNIQUEMENT dans le layout `(marketing)` via une classe sur son wrapper racine.
      fontFamily: {
        "tenderos-display": ["var(--font-tenderos-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        "tenderos-body": ["var(--font-tenderos-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
