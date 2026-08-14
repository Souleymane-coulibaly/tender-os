import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — TenderOS",
  robots: { index: false, follow: true },
  alternates: { canonical: "/legal/terms" },
};

/**
 * V2 Sprint 23 (landing) — mission §54. Structure standard d'un CGU SaaS B2B, contenu juridique
 * précis (juridiction, éditeur, modalités contractuelles complètes) laissé en placeholder — jamais
 * rédigé sans validation juridique réelle.
 */
export default function TermsOfServicePage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-tenderos-slate sm:px-6">
      <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">Conditions Générales d&apos;Utilisation</h1>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">1. Objet</h2>
          <p className="mt-2">Les présentes Conditions Générales d&apos;Utilisation régissent l&apos;accès et l&apos;utilisation de la plateforme TenderOS. Le contenu contractuel définitif est en cours de finalisation : [PENDING LEGAL CONTENT]</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">2. Accès au service</h2>
          <p className="mt-2">Modalités d&apos;accès, création de compte et d&apos;organisation : [PENDING LEGAL CONTENT]</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">3. Propriété intellectuelle</h2>
          <p className="mt-2">[PENDING LEGAL CONTENT]</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">4. Responsabilité</h2>
          <p className="mt-2">[PENDING LEGAL CONTENT]</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">5. Droit applicable et juridiction compétente</h2>
          <p className="mt-2">[PENDING LEGAL CONTENT]</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Contact</h2>
          <p className="mt-2">Pour toute question relative aux présentes CGU, utilisez notre <a href="/contact" className="font-semibold text-tenderos-blue">formulaire de contact</a>.</p>
        </div>
      </div>
    </section>
  );
}
