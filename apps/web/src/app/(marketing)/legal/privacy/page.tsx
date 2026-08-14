import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — TenderOS",
  robots: { index: false, follow: true },
  alternates: { canonical: "/legal/privacy" },
};

/**
 * V2 Sprint 23 (landing) — mission §54/§12. Les droits RGPD listés (accès/rectification/effacement/
 * portabilité/opposition) sont des droits GÉNÉRAUX garantis par le règlement (articles 15-21),
 * jamais une allégation propre à TenderOS — seules les données d'identification du responsable de
 * traitement/DPO/hébergeur restent des placeholders explicites.
 */
export default function PrivacyPolicyPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-tenderos-slate sm:px-6">
      <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">Politique de confidentialité</h1>
      <p className="mt-3 text-sm">TenderOS est conçu avec une approche de protection des données par conception (privacy by design).</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Responsable de traitement</h2>
          <p className="mt-2">Identité et coordonnées du responsable de traitement : [PENDING LEGAL CONTENT]</p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Délégué à la protection des données</h2>
          <p className="mt-2">Contact du DPO (le cas échéant) : [PENDING LEGAL CONTENT]</p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Données collectées sur ce site</h2>
          <p className="mt-2">
            Sur la Landing Page publique, seules les données que vous nous transmettez volontairement via le formulaire de contact (nom, email professionnel, entreprise, téléphone et message optionnels) sont traitées. Avec votre consentement, des données de mesure d&apos;audience anonymisées (Google Analytics 4) et de support (Crisp) peuvent également être collectées — voir notre <a href="/legal/cookies" className="font-semibold text-tenderos-blue">politique cookies</a>.
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Hébergement des données</h2>
          <p className="mt-2">Détail de l&apos;hébergeur et localisation des serveurs : [PENDING LEGAL CONTENT]</p>
        </div>

        <div>
          <h2 className="text-base font-bold text-tenderos-navy">Vos droits</h2>
          <p className="mt-2">
            Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, de portabilité et d&apos;opposition sur vos données personnelles. Vous pouvez exercer ces droits en nous contactant via notre <a href="/contact" className="font-semibold text-tenderos-blue">formulaire de contact</a>. Vous disposez également du droit d&apos;introduire une réclamation auprès de la CNIL (www.cnil.fr).
          </p>
        </div>
      </div>
    </section>
  );
}
