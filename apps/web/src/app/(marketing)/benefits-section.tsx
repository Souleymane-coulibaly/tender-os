import { GA_EVENTS } from "../../lib/analytics";
import { TrackedLink } from "../../components/marketing/tracked-link";

// V2 Sprint 25 (mission §25.33/§25.34) — REMPLACE `PricingSection` sur la Landing (tarifs détaillés
// retirés, mission §25.33) : copie et pictogrammes fixés par la mission (§25.35-§25.41), jamais
// improvisés. `/pricing` (Sprint 25B) devient la seule référence commerciale ; cette section reste
// volontairement sans aucun prix.
const BENEFITS = [
  {
    title: "Ne cherchez plus partout",
    text: "Vos opportunités pertinentes sont détectées et centralisées pour vous permettre de vous concentrer sur les marchés qui comptent réellement.",
    color: "#1472FF",
    icon: <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "Comprenez un DCE plus rapidement",
    text: "TenderOS vous aide à identifier les lots, exigences, critères, documents attendus et points de vigilance.",
    color: "#1472FF",
    icon: (
      <>
        <path d="M6 3a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8l-5-5H6z" stroke="#1472FF" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="10.5" cy="14.5" r="2.5" stroke="#1472FF" strokeWidth="1.8" />
        <path d="M12.5 16.5L15 19" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "Décidez plus sereinement",
    text: "GO / NO-GO, checklist et informations clés vous permettent de prioriser vos efforts sur les bonnes opportunités.",
    color: "#D4AF37",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="#D4AF37" strokeWidth="1.8" />
        <path d="M8 12.3L10.6 15L16 9" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Ne repartez plus de zéro",
    text: "Capitalisez sur votre bibliothèque, vos références et vos modèles pour accélérer chaque nouvelle réponse.",
    color: "#1472FF",
    icon: (
      <>
        <path d="M4 4v16M9 4v16M4 4h5M4 20h5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 5l6 1.3-2.3 14L12 19" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Travaillez vraiment en équipe",
    text: "Centralisez responsabilités, échanges, validations et avancement dans un même espace.",
    color: "#1472FF",
    icon: (
      <path
        d="M8 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M13 15c2.5 0 6 2 6 5"
        stroke="#1472FF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Gardez le contrôle jusqu'au dépôt",
    text: "Administratif, mémoire technique, chiffrage et package final restent intégrés dans un workflow structuré.",
    color: "#D4AF37",
    icon: (
      <>
        <path d="M3.5 8L12 3.5 20.5 8 12 12.5 3.5 8z" stroke="#D4AF37" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3.5 8v8l8.5 4.5 8.5-4.5V8" stroke="#D4AF37" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 12l2 2 3.5-3.5" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
] as const;

export function BenefitsSection() {
  return (
    <section id="benefices" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="font-tenderos-display text-center text-3xl font-extrabold text-tenderos-navy">TenderOS simplifie chaque étape de vos appels d&apos;offres</h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-tenderos-slate">
        Moins de tâches répétitives. Plus de visibilité.
        <br />
        Plus de temps pour construire une réponse gagnante.
      </p>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="rounded-2xl border border-tenderos-navy/10 p-6 transition hover:shadow-lg hover:shadow-tenderos-navy/5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tenderos-light">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {benefit.icon}
              </svg>
            </div>
            <h3 className="font-tenderos-display mt-4 text-base font-bold text-tenderos-navy">{benefit.title}</h3>
            <p className="mt-2 text-sm text-tenderos-slate">{benefit.text}</p>
          </div>
        ))}
      </div>

      {/* Bloc final (mission §25.41) — clôt la section bénéfices, jamais un second CTA "tarifs"
          générique : le CTA secondaire est le SEUL renvoi vers `/pricing` depuis cette section. */}
      <div className="mt-16 flex flex-col items-center gap-6 rounded-2xl bg-tenderos-navy px-8 py-12 text-center">
        <div>
          <h3 className="font-tenderos-display text-2xl font-extrabold text-white">
            De l&apos;opportunité au dossier final,
            <br />
            tout reste au même endroit.
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-white/70">TenderOS transforme un processus dispersé entre emails, fichiers, tableurs et outils multiples en un workflow structuré et pilotable.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <TrackedLink
            href="/contact"
            event={GA_EVENTS.DemoCtaClicked}
            params={{ location: "benefits-final" }}
            className="rounded-lg bg-tenderos-gold px-6 py-3 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-gold-light"
          >
            Découvrir TenderOS
          </TrackedLink>
          <a href="/pricing" className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
            Voir les tarifs
          </a>
        </div>
      </div>
    </section>
  );
}
