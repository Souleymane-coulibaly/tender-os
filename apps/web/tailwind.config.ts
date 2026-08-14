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
