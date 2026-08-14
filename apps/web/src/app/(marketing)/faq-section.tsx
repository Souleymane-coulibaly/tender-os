import { LANDING_FAQ } from "../../lib/landing-faq";

/**
 * V2 Sprint 23A (landing, finalisation) — mission §42P-§42S. `<details>`/`<summary>` natifs plutôt
 * qu'un accordéon React "use client" : accessibilité clavier/focus/état gérée nativement par le
 * navigateur (équivalent du pattern ARIA accordion, sans avoir à recoder `aria-expanded`/
 * `aria-controls` à la main), contenu TOUJOURS présent dans le HTML servi (jamais conditionné à
 * l'hydratation JS, mission §42T "les réponses doivent être dans le HTML"), et reste un Server
 * Component (mission §47 "Server Components par défaut" — encore mieux respecté qu'un accordéon
 * client).
 */
export function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <h2 className="font-tenderos-display text-center text-3xl font-extrabold text-tenderos-navy">Questions fréquentes</h2>
      <p className="mt-3 text-center text-tenderos-slate">Tout ce qu&apos;il faut savoir avant de commencer avec TenderOS.</p>

      <div className="mt-10 divide-y divide-tenderos-navy/10 border-t border-tenderos-navy/10">
        {LANDING_FAQ.map((item) => (
          <details key={item.question} className="tenderos-faq-item group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tenderos-blue">
              <span className="font-tenderos-display text-sm font-semibold text-tenderos-navy sm:text-base">{item.question}</span>
              <svg
                className="tenderos-faq-chevron h-5 w-5 shrink-0 text-tenderos-navy/50 transition-transform duration-200"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="mt-3 pr-8 text-sm leading-relaxed text-tenderos-slate">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
