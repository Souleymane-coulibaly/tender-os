import type { Metadata } from "next";
import { GA_EVENTS } from "../../../lib/analytics";
import type { PublicPlanCatalogEntry } from "../../../lib/billing-types";
import { PRICING_FAQ } from "../../../lib/pricing-faq";
import { publicApiFetch } from "../../../lib/public-api-client";
import { PageViewTracker } from "../../../components/marketing/page-view-tracker";
import { FaqSection } from "../faq-section";
import { PricingComparator } from "./pricing-comparator";
import { PricingPlansSection } from "./pricing-plans-section";

// V2 Sprint 25 (Pricing dédié) — mission §25.53 "SEO PRICING".
export const metadata: Metadata = {
  title: "Tarifs TenderOS — Pass, Starter, Business et Entreprise",
  description: "Découvrez les offres TenderOS et démarrez 14 jours d'essai sur Starter.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Tarifs TenderOS — Pass, Starter, Business et Entreprise",
    description: "Découvrez les offres TenderOS et démarrez 14 jours d'essai sur Starter.",
    url: "/pricing",
    type: "website",
  },
};

/**
 * V2 Sprint 25 (mission §25.32) — `/pricing` devient la SEULE référence commerciale publique
 * (mission §25.33 : tarifs détaillés retirés de la Landing). Même motif de résilience que l'ancienne
 * Landing (Sprint 23) : le catalogue est le seul appel réseau de la page, un échec dégrade
 * proprement plutôt que de faire planter toute la page (mission §2 "même si Stripe est
 * momentanément indisponible").
 */
export default async function PricingPage() {
  let planCatalog: PublicPlanCatalogEntry[] = [];
  try {
    const response = await publicApiFetch<{ items: PublicPlanCatalogEntry[] }>("/api/v1/billing/plan-catalog");
    planCatalog = response.items;
  } catch {
    planCatalog = [];
  }

  return (
    <>
      <PageViewTracker event={GA_EVENTS.PricingPageViewed} />
      <section className="mx-auto max-w-3xl px-4 pb-4 pt-16 text-center sm:px-6">
        <h1 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy sm:text-4xl">Des offres adaptées à votre façon de répondre</h1>
        <p className="mt-4 text-tenderos-slate">Choisissez la formule qui correspond au volume et au niveau de collaboration de votre équipe.</p>
      </section>

      {planCatalog.length > 0 ? (
        <>
          <PricingPlansSection items={planCatalog} />
          <PricingComparator items={planCatalog} />
        </>
      ) : (
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <p className="text-tenderos-slate">Nos tarifs sont momentanément indisponibles. Contactez-nous pour en savoir plus.</p>
        </section>
      )}

      <FaqSection items={PRICING_FAQ} title="Questions sur nos tarifs" subtitle="Tout ce qu'il faut savoir avant de choisir votre formule." sectionId="faq-pricing" />
    </>
  );
}
