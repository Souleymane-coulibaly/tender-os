import type { Metadata } from "next";
import { LANDING_FAQ } from "../../lib/landing-faq";
import { AiSection } from "./ai-section";
import { BenefitsSection } from "./benefits-section";
import { FaqSection } from "./faq-section";
import { FeaturesSection } from "./features-section";
import { FinalCtaSection } from "./final-cta-section";
import { HeroSection } from "./hero-section";
import { IntegrationsSection } from "./integrations-section";
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
 * authentifié ici, contrairement à `redirect("/app")` retiré).
 * V2 Sprint 25 (mission §25.33) — plus aucun appel réseau sur cette page : le catalogue Pricing
 * (et son fetch `publicApiFetch`) a été retiré avec les cards détaillées, `/pricing` (Sprint 25B)
 * en devient la SEULE consommatrice pour la Landing/Onboarding. `BenefitsSection` est un contenu
 * entièrement statique, jamais dépendant d'un appel réseau qui pourrait échouer.
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

export default function LandingPage() {
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
      <BenefitsSection />
      <FaqSection />
      <FinalCtaSection />
    </>
  );
}
