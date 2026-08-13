import type { NextConfig } from "next";

/** Sprint 21 (hardening) — mission §11, aucun en-tête de sécurité n'existait nulle part dans la
 *  pile (ni API ni web). Volontairement modéré (jamais une CSP agressive qui casserait
 *  l'application, mission "ne pas casser l'application avec une CSP trop agressive") : `'self'`
 *  couvre le cas d'usage réel (Next.js sert ses propres scripts/styles same-origin), `frame-ancestors
 *  'none'` bloque le clickjacking sans dépendre de X-Frame-Options (obsolète face à CSP mais gardé
 *  en double pour les anciens navigateurs). */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Le lint est un script dédié (`pnpm lint`, eslint.config.mjs à la racine du monorepo) ;
  // éviter une double exécution (et une détection de plugin en flat config non fiable) ici.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers:
          process.env.NODE_ENV === "production"
            ? [...SECURITY_HEADERS, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
