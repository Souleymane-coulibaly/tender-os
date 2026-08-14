import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "À propos — TenderOS",
  description: "TenderOS est la plateforme intelligente de réponse aux appels d'offres.",
  alternates: { canonical: "/a-propos" },
};

/**
 * V2 Sprint 23 (landing) — mission rule #9 "ne pas inventer de références commerciales" : aucune
 * date de création, effectif, levée de fonds ou historique d'entreprise n'est inventé ici — le
 * contenu se limite à la mission produit, déjà validée.
 */
export default function AboutPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">À propos de TenderOS</h1>

      <div className="mt-6 space-y-4 text-tenderos-slate">
        <p>
          TenderOS est une plateforme conçue pour aider les entreprises à détecter, analyser, préparer et gérer leurs réponses aux appels d&apos;offres — de la veille jusqu&apos;au dossier final.
        </p>
        <p>
          Notre objectif : réduire significativement le temps nécessaire pour préparer une réponse, en combinant intelligence artificielle, collaboration d&apos;équipe et suivi structuré, tout en gardant la décision finale entre les mains des équipes qui répondent.
        </p>
        <p>
          TenderOS centralise le dossier de réponse, analyse les documents de consultation, facilite la collaboration entre les équipes et accompagne le chiffrage jusqu&apos;au package final de soumission.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/contact" className="rounded-lg bg-tenderos-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90">
          Nous contacter
        </Link>
        <Link href="/#tarifs" className="rounded-lg border border-tenderos-navy/20 px-6 py-3 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light">
          Voir les tarifs
        </Link>
      </div>
    </section>
  );
}
