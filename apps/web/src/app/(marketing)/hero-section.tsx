import { GA_EVENTS } from "../../lib/analytics";
import { TrackedLink } from "../../components/marketing/tracked-link";
import { DashboardPreview } from "./dashboard-preview";

const TRUST_BADGES = [
  { title: "Sécurité renforcée", subtitle: "Données chiffrées" },
  { title: "Hébergement européen", subtitle: "Données hébergées en France" },
  { title: "RGPD-ready", subtitle: "Conforme par conception" },
] as const;

export function HeroSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-tenderos-gold/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-tenderos-navy">
            ★ Plateforme intelligente de réponse aux appels d&apos;offres
          </span>

          <h1 className="font-tenderos-display mt-5 text-4xl font-extrabold leading-tight text-tenderos-navy sm:text-5xl">
            Gagnez plus
            <br />
            d&apos;appels d&apos;offres.
            <br />
            <span className="text-tenderos-gold">Plus vite. Ensemble.</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-tenderos-slate">
            TenderOS centralise, structure et sécurise l&apos;ensemble de votre processus de réponse aux appels d&apos;offres, de la veille au dossier final.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <TrackedLink
              href="/contact"
              event={GA_EVENTS.DemoCtaClicked}
              params={{ location: "hero" }}
              className="rounded-lg bg-tenderos-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
            >
              Demander une démo
            </TrackedLink>
            <a href="#fonctionnalites" className="rounded-lg border border-tenderos-navy/20 px-6 py-3 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light">
              Voir le produit
            </a>
          </div>

          <div id="securite" className="mt-10 flex flex-wrap gap-6">
            {TRUST_BADGES.map((badge) => (
              <div key={badge.title} className="flex items-start gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
                  <circle cx="9" cy="9" r="8" stroke="#1472FF" strokeWidth="1.5" />
                  <path d="M5.5 9.2L7.7 11.4L12.5 6.6" stroke="#1472FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-tenderos-navy">{badge.title}</p>
                  <p className="text-xs text-tenderos-slate">{badge.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DashboardPreview />
      </div>
    </section>
  );
}
