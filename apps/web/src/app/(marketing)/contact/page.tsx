import type { Metadata } from "next";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Demander une démo — TenderOS",
  description: "Contactez l'équipe TenderOS pour une démonstration personnalisée ou toute question sur nos offres.",
  alternates: { canonical: "/contact" },
};

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  pass: "Pass AO",
  starter: "Starter",
  business: "Business",
  enterprise: "Entreprise",
  conseil: "Conseil",
};

type SearchParams = { plan?: string; billing?: string };

/**
 * V2 Sprint 23 (landing) — mission §27. Réutilisé aussi comme destination des CTA Pricing (mission
 * §24/§25, en attendant l'Onboarding Sprint 24) : `?plan=`/`?billing=` préremplissent le message,
 * jamais perdus (mission §25 "choix Pass conservé").
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const planLabel = params.plan ? (PLAN_DISPLAY_NAMES[params.plan] ?? params.plan) : undefined;
  const billingLabel = params.billing === "yearly" ? "annuel" : params.billing === "monthly" ? "mensuel" : undefined;
  const prefillMessage = planLabel ? `Intéressé(e) par l'offre ${planLabel}${billingLabel ? ` (${billingLabel})` : ""}.` : undefined;

  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-tenderos-display text-center text-3xl font-extrabold text-tenderos-navy">Demander une démo</h1>
      <p className="mt-3 text-center text-tenderos-slate">Échangez avec notre équipe pour découvrir comment TenderOS peut structurer et accélérer vos réponses aux appels d&apos;offres.</p>

      <div className="mt-10">
        <ContactForm prefillMessage={prefillMessage} />
      </div>
    </section>
  );
}
