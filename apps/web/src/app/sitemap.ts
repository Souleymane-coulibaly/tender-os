import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** V2 Sprint 23 (landing) — mission §44. Uniquement les pages publiques réellement indexables
 *  (jamais `/legal/*`, exclu de l'index via `robots.ts`, mission §54 "pas de noindex accidentel"
 *  s'applique aux pages qui DOIVENT être indexées — celles-ci sont volontairement `noindex`). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/a-propos`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
