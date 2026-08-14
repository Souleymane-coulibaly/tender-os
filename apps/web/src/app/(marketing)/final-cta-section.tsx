import { GA_EVENTS } from "../../lib/analytics";
import { TrackedLink } from "../../components/marketing/tracked-link";
import { getPlanCtaHref } from "../../lib/plan-cta";

export function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-tenderos-navy px-8 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <h2 className="font-tenderos-display text-2xl font-extrabold text-white">Prêt à mieux piloter vos appels d&apos;offres ?</h2>
          <p className="mt-2 text-white/70">Découvrez comment TenderOS peut structurer et accélérer vos réponses.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
          <TrackedLink
            href="/contact"
            event={GA_EVENTS.DemoCtaClicked}
            params={{ location: "final-cta" }}
            className="rounded-lg bg-tenderos-gold px-6 py-3 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-gold-light"
          >
            Demander une démo
          </TrackedLink>
          <TrackedLink
            href={getPlanCtaHref("pass")}
            event={GA_EVENTS.PassAoClicked}
            className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Commencer avec un Pass
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
