import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales — TenderOS",
  robots: { index: false, follow: true },
  alternates: { canonical: "/legal/mentions" },
};

/**
 * V2 Sprint 23 (landing) — mission §54 "IMPORTANT : ne pas inventer d'informations juridiques
 * précises". Chaque donnée d'identification (raison sociale, SIRET, siège, capital, directeur de
 * publication, hébergeur) est un placeholder explicite — jamais une valeur plausible mais fausse.
 */
export default function LegalMentionsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-tenderos-slate sm:px-6">
      <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">Mentions légales</h1>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Éditeur du site</h2>
          <p className="mt-2">
            Raison sociale : [PENDING LEGAL CONTENT]<br />
            Forme juridique : [PENDING LEGAL CONTENT]<br />
            Capital social : [PENDING LEGAL CONTENT]<br />
            Siège social : [PENDING LEGAL CONTENT]<br />
            SIRET : [PENDING LEGAL CONTENT]<br />
            Directeur de la publication : [PENDING LEGAL CONTENT]
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Hébergement</h2>
          <p className="mt-2">Nom de l&apos;hébergeur, adresse, contact : [PENDING LEGAL CONTENT]</p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Contact</h2>
          <p className="mt-2">Pour toute question, utilisez notre <a href="/contact" className="font-semibold text-tenderos-blue">formulaire de contact</a>.</p>
        </div>
      </div>
    </section>
  );
}
