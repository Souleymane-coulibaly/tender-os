import type { Metadata } from "next";
import type { PublicPlanCatalogEntry } from "../../lib/billing-types";
import { LANDING_FAQ } from "../../lib/landing-faq";
import { publicApiFetch } from "../../lib/public-api-client";
import { AiSection } from "./ai-section";
import { FaqSection } from "./faq-section";
import { FeaturesSection } from "./features-section";
import { FinalCtaSection } from "./final-cta-section";
import { HeroSection } from "./hero-section";
import { IntegrationsSection } from "./integrations-section";
import { PricingSection } from "./pricing-section";
import { TrustSection } from "./trust-section";
import { WorkflowSection } from "./workflow-section";

export const metadata: Metadata = {
  title: "TenderOS — Plateforme intelligente de réponse aux appels d'offres",
  description: "Centralisez vos appels d'offres, analysez vos DCE avec l'IA, préparez vos mémoires techniques, vos chiffrages et votre dossier final avec TenderOS.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "TenderOS — Plateforme intelligente de réponse aux appels d'offres",
    description: "Centralisez vos appels d'offres, analysez vos DCE avec l'IA, préparez vos mémoires techniques, vos chiffrages et votre dossier final avec TenderOS.",
    url: "/",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "TenderOS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TenderOS — Plateforme intelligente de réponse aux appels d'offres",
    description: "Centralisez vos appels d'offres, analysez vos DCE avec l'IA, préparez vos mémoires techniques, vos chiffrages et votre dossier final avec TenderOS.",
    images: ["/og-image.png"],
  },
};

/**
 * V2 Sprint 23 (landing) — mission §2 : `/` ne dépend JAMAIS d'une session (aucun appel
 * authentifié ici, contrairement à `redirect("/app")` retiré). Le catalogue Pricing est le SEUL
 * appel réseau de la page — s'il échoue (API indisponible), la Landing reste utilisable (mission
 * §2 "même si Stripe est momentanément indisponible") : `PricingSection` reçoit un tableau vide et
 * affiche un état dégradé plutôt qu'un crash de toute la page.
 */
/**
 * Mission §45 — uniquement des données réelles/vérifiables (nom, description, catégorie), jamais
 * `aggregateRating`/`review`/`customerCount` (mission §45/§57 : aucun chiffre n'est inventé).
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "TenderOS", url: "/", logo: "/brand/tenderos-icon-square.svg" },
    {
      "@type": "SoftwareApplication",
      name: "TenderOS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "Plateforme intelligente de réponse aux appels d'offres.",
    },
    // Mission §42T — dérivé de `LANDING_FAQ` (jamais une copie séparée) : garantit que le schema
    // ne peut jamais diverger du contenu réellement affiché par `FaqSection`.
    {
      "@type": "FAQPage",
      mainEntity: LANDING_FAQ.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default async function LandingPage() {
  let planCatalog: PublicPlanCatalogEntry[] = [];
  try {
    const response = await publicApiFetch<{ items: PublicPlanCatalogEntry[] }>("/api/v1/billing/plan-catalog");
    planCatalog = response.items;
  } catch {
    planCatalog = [];
  }

  return (
    <>
      {/* JSON-LD statique, aucune donnée utilisateur interpolée */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <HeroSection />
      <TrustSection />
      <FeaturesSection />
      <WorkflowSection />
      <AiSection />
      <IntegrationsSection />
      {planCatalog.length > 0 ? (
        <PricingSection items={planCatalog} />
      ) : (
        <section id="tarifs" className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-tenderos-display text-3xl font-extrabold text-tenderos-navy">Des offres adaptées à chaque organisation</h2>
          <p className="mt-4 text-tenderos-slate">Nos tarifs sont momentanément indisponibles. Contactez-nous pour en savoir plus.</p>
        </section>
      )}
      <FaqSection />
      <FinalCtaSection />
    </>
  );
}
