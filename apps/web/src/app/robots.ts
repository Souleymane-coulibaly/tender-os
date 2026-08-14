import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * V2 Sprint 23 (landing) — mission §44. `/app`/`/platform-admin` explicitement disallow : aucune
 * surface authentifiée n'a de valeur SEO, et les indexer risquerait d'exposer des URLs internes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/platform-admin", "/legal"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
