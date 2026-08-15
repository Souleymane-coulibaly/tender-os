import { SECTORS } from "../../lib/sectors";

function SectorList({ ariaHidden }: { ariaHidden: boolean }) {
  return (
    <div className={`flex shrink-0 items-center gap-x-8 pr-8 ${ariaHidden ? "tenderos-marquee-duplicate" : ""}`} aria-hidden={ariaHidden}>
      {SECTORS.map((sector) => (
        <span key={sector} className="flex items-center gap-x-8">
          <span className="whitespace-nowrap text-sm font-medium text-tenderos-slate">{sector}</span>
          <span className="text-tenderos-navy/20" aria-hidden="true">•</span>
        </span>
      ))}
    </div>
  );
}

/**
 * V2 Sprint 23A (landing, finalisation) — mission §31-§42. Raffinement du rendu (typographie plus
 * fine, secondaire par rapport au Hero) + transformation en bandeau horizontal déroulant premium.
 * Jamais des logos clients (mission rule §7/§42, section volontairement remplacée par un
 * positionnement sectoriel depuis Sprint 23). La seconde copie (`ariaHidden`) existe UNIQUEMENT
 * pour la boucle CSS — jamais lue deux fois par une technologie d'assistance (mission §54/§70).
 */
export function TrustSection() {
  return (
    <section className="border-y border-tenderos-navy/5 bg-tenderos-light py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-tenderos-slate">
          Conçu pour les équipes qui répondent aux appels d&apos;offres
        </p>

        <div className="relative mt-5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
          <div className="tenderos-marquee-track flex w-max items-center">
            <SectorList ariaHidden={false} />
            <SectorList ariaHidden={true} />
          </div>
        </div>
      </div>
    </section>
  );
}
