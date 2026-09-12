import type { Metadata } from "next";
import { HEAD_OFFICE_ADDRESS, LEGAL_ENTITY, PUBLISHER_STATEMENT } from "../../../../lib/legal-entity";

export const metadata: Metadata = {
  title: "Mentions légales — TenderOS",
  robots: { index: false, follow: true },
  alternates: { canonical: "/legal/mentions" },
};

const PUBLISHER_ROWS: readonly (readonly [string, string])[] = [
  ["Dénomination sociale", LEGAL_ENTITY.name],
  ["Nom du service", LEGAL_ENTITY.product],
  ["Forme juridique", LEGAL_ENTITY.legalForm],
  ["Capital social", LEGAL_ENTITY.shareCapital],
  ["Siège social", HEAD_OFFICE_ADDRESS],
  ["SIREN", LEGAL_ENTITY.siren],
  ["SIRET du siège", LEGAL_ENTITY.siretHeadOffice],
  ["RCS (ville d'immatriculation)", LEGAL_ENTITY.rcs],
  ["TVA intracommunautaire", LEGAL_ENTITY.vatNumber],
  ["Code NAF / APE", LEGAL_ENTITY.nafCode],
  ["Date de création", LEGAL_ENTITY.creationDate],
  ["Dirigeant", LEGAL_ENTITY.director],
];

/**
 * Mentions légales — identité de l'éditeur lue dans `lib/legal-entity.ts` (source unique). Toute
 * information non fournie (RCS, hébergeur, email juridique) reste « À CONFIRMER », jamais une
 * valeur plausible inventée (V2 Sprint 23, mission §54).
 */
export default function LegalMentionsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-tenderos-slate sm:px-6">
      <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">Mentions légales</h1>
      <p className="mt-4 text-sm leading-relaxed">{PUBLISHER_STATEMENT}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Éditeur du service</h2>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
            {PUBLISHER_ROWS.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-medium text-tenderos-navy">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Directeur de la publication</h2>
          <p className="mt-2">{LEGAL_ENTITY.publicationDirector}</p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Hébergement</h2>
          <p className="mt-2">Hébergeur(s), adresse et contact : {LEGAL_ENTITY.host}</p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Contact</h2>
          <p className="mt-2">
            Pour toute question, utilisez notre{" "}
            <a href="/contact" className="font-semibold text-tenderos-blue">
              formulaire de contact
            </a>
            . Adresse email juridique : {LEGAL_ENTITY.legalEmail}
          </p>
        </div>
      </div>
    </section>
  );
}
