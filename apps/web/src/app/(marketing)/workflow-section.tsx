import type { ReactNode } from "react";

type Step = Readonly<{ label: string; ariaLabel?: string; icon: ReactNode }>;

/**
 * V2 Sprint 23A — mission §42B/§42C. Même famille graphique que `features-section.tsx` (stroke
 * 1.8, navy #1472FF, accent gold parcimonieux) — aucune nouvelle dépendance d'icônes (mission §29 :
 * ni bibliothèque installée ni composant d'icônes existant dans le dépôt avant ce sprint, audité).
 */
const STEPS: readonly Step[] = [
  {
    label: "Détecter",
    icon: <><circle cx="10" cy="10" r="6" stroke="#1472FF" strokeWidth="1.8" /><path d="M20 20l-5.5-5.5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    label: "Analyser",
    icon: <><path d="M7 3h6l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#1472FF" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="10.5" cy="13.5" r="2.2" stroke="#1472FF" strokeWidth="1.8" /><path d="M12.2 15.2L14 17" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    label: "GO / NO-GO",
    ariaLabel: "Décider GO ou NO-GO",
    icon: <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    label: "Préparer",
    icon: <><rect x="5" y="4" width="14" height="17" rx="2" stroke="#1472FF" strokeWidth="1.8" /><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="#1472FF" strokeWidth="1.8" /><path d="M8.5 10.5h7M8.5 14.5h7M8.5 18.5h4" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    label: "Collaborer",
    icon: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M13 15c2.5 0 6 2 6 5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    label: "Chiffrer",
    icon: <><circle cx="12" cy="12" r="9" stroke="#1472FF" strokeWidth="1.8" /><path d="M14.5 8.3a4 4 0 100 7.4M9 11h4M9 13h4" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    label: "Valider",
    icon: <><path d="M12 2.5l2 1.2 2.3-.3 1 2.1 2.1 1-.3 2.3L20.5 11l-1.2 2 .3 2.3-2.1 1-1 2.1-2.3-.3L12 19.5l-2-1.2-2.3.3-1-2.1-2.1-1 .3-2.3L3.5 11l1.2-2-.3-2.3 2.1-1 1-2.1 2.3.3z" stroke="#1472FF" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 11.5l2 2 4-4.5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
  {
    label: "Finaliser",
    icon: <path d="M3.5 11.5L20 4l-6.5 16.5-2.7-6.8-6.8-2.2z" stroke="#D4AF37" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />,
  },
];

function WorkflowStep({ step, isLast, isGridRowBreak }: { step: Step; isLast: boolean; isGridRowBreak: boolean }) {
  return (
    <li className="flex shrink-0 snap-start items-center xl:shrink">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {step.icon}
          </svg>
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-tenderos-navy lg:text-[13px]" aria-label={step.ariaLabel}>
          {step.label}
        </span>
      </div>
      {/* En grille 4+4 (md/lg), la 4ᵉ étape termine sa rangée — sa flèche pointerait dans le vide
          vers une étape qui se trouve en réalité sur la rangée suivante (mission §42G "parfaitement
          alignés") : masquée uniquement à ces paliers, ré-affichée dès `xl` (ligne unique). */}
      {!isLast ? (
        <span className={`mx-2 mb-6 hidden text-tenderos-navy/25 lg:mx-3 ${isGridRowBreak ? "xl:inline" : "md:inline"}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </li>
  );
}

/**
 * V2 Sprint 23A — correctif d'un bug réel (mission §42B) : la version Sprint 23 utilisait
 * `sm:flex-wrap`, qui faisait systématiquement passer "Finaliser" à la ligne dès que la somme des
 * 8 étapes dépassait la largeur disponible (dès ~1280px avec 8 libellés complets). `xl:flex-nowrap`
 * garantit une ligne unique sur desktop large (mission §42N, testé à 1440/1280) ; `lg`/`md` passent
 * en grille 4+4 (mission §42J) ; en dessous, défilement tactile horizontal (mission §42K), jamais
 * une compression illisible.
 */
export function WorkflowSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="rounded-2xl bg-tenderos-light p-6 sm:p-8">
        <h2 className="font-tenderos-display text-center text-xl font-bold text-tenderos-navy">Un processus. Une plateforme. De meilleurs résultats.</h2>

        <ol className="mt-8 flex snap-x snap-mandatory gap-x-5 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:justify-items-center md:gap-x-4 md:gap-y-8 md:overflow-visible md:pb-0 xl:flex xl:flex-nowrap xl:items-start xl:justify-between xl:gap-x-0">
          {STEPS.map((step, index) => (
            <WorkflowStep key={step.label} step={step} isLast={index === STEPS.length - 1} isGridRowBreak={index === 3} />
          ))}
        </ol>
      </div>
    </section>
  );
}
