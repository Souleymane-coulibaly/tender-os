import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Le lint est un script dédié (`pnpm lint`, eslint.config.mjs à la racine du monorepo) ;
  // éviter une double exécution (et une détection de plugin en flat config non fiable) ici.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
