import type { ReactNode } from "react";
import { AnalyticsLoader } from "../../components/marketing/analytics-loader";
import { ConsentProvider } from "../../components/marketing/consent-provider";
import { CookieBanner } from "../../components/marketing/cookie-banner";
import { CookieSettingsModal } from "../../components/marketing/cookie-settings-modal";
import { CrispLoader } from "../../components/marketing/crisp-loader";
import { SiteFooter } from "../../components/marketing/site-footer";
import { SiteHeader } from "../../components/marketing/site-header";

/**
 * V2 Sprint 23 (landing) — mission §2 : cette surface (`/`, `/contact`, `/a-propos`, `/legal/*`)
 * ne dépend JAMAIS d'une session authentifiée, fonctionne sans compte/sans cookie Analytics/sans
 * Crisp/même si Stripe est indisponible (aucun appel Stripe n'a lieu ici). `font-tenderos-body`
 * appliqué UNIQUEMENT sur ce wrapper — jamais sur `<body>` du layout racine (non-régression §72 :
 * `/app`/`/platform-admin` gardent leur police système d'origine).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <ConsentProvider>
      <div className="font-tenderos-body flex min-h-screen flex-col text-tenderos-navy">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
      <CookieBanner />
      <CookieSettingsModal />
      <AnalyticsLoader />
      <CrispLoader />
    </ConsentProvider>
  );
}
