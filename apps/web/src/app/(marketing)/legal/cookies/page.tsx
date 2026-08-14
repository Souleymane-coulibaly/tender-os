import type { Metadata } from "next";
import { CookieSettingsButton } from "./cookie-settings-button";

export const metadata: Metadata = {
  title: "Gestion des cookies — TenderOS",
  robots: { index: false, follow: true },
  alternates: { canonical: "/legal/cookies" },
};

const CATEGORIES = [
  { name: "Nécessaires", status: "Toujours actifs", description: "Indispensables au fonctionnement du site (préférences de consentement, sécurité). Ne nécessitent pas de consentement." },
  { name: "Mesure d'audience", status: "Sur consentement", description: "Google Analytics 4 — statistiques de fréquentation anonymisées, désactivées par défaut." },
  { name: "Support", status: "Sur consentement", description: "Crisp — chat de support en direct, désactivé par défaut." },
] as const;

/** V2 Sprint 23 (landing) — mission §54. Décrit fidèlement l'implémentation réelle de ce sprint
 *  (`lib/consent.ts`), jamais une politique générique déconnectée du code. */
export default function CookiesPolicyPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-tenderos-slate sm:px-6">
      <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">Gestion des cookies</h1>
      <p className="mt-3 text-sm">
        TenderOS utilise des technologies nécessaires au fonctionnement du site et, avec votre accord, des outils de mesure d&apos;audience et de support. Vous pouvez modifier vos choix à tout moment.
      </p>

      <div className="mt-6">
        <CookieSettingsButton />
      </div>

      <div className="mt-10 space-y-4">
        {CATEGORIES.map((category) => (
          <div key={category.name} className="rounded-xl border border-tenderos-navy/10 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-tenderos-navy">{category.name}</h2>
              <span className="rounded-full bg-tenderos-light px-3 py-1 text-xs font-semibold text-tenderos-slate">{category.status}</span>
            </div>
            <p className="mt-2 text-sm">{category.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
