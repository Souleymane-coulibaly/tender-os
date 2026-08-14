import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// V2 Sprint 23 (landing) — next/font AUTO-HÉBERGE les fichiers de police au build (aucune requête
// runtime vers fonts.googleapis.com, aucune ligne CSP à ajouter pour ça, mission §6 "sans font
// embarquée [dans le SVG]" — ceci est hors-SVG, page web normale). Exposées comme variables CSS
// UNIQUEMENT (jamais appliquées ici au <body>) — seul le layout `(marketing)` les active via une
// classe sur son wrapper, pour ne jamais changer la police de /app ni /platform-admin (non-régression §72).
const tenderosDisplay = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-tenderos-display", display: "swap" });
const tenderosBody = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-tenderos-body", display: "swap" });

export const metadata: Metadata = {
  // V2 Sprint 23 (landing) — sans ceci, les URLs relatives (`/og-image.png`) résolvent contre
  // `http://localhost:3000` même en production (mission §46 "image OG premium", §66 SEO).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "TenderOS",
  description: "Système d'exploitation IA dédié aux appels d'offres.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${tenderosDisplay.variable} ${tenderosBody.variable}`}>
      <body>{children}</body>
    </html>
  );
}
