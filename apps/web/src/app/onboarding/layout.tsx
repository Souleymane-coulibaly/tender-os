import type { ReactNode } from "react";
import Link from "next/link";
import { AnalyticsLoader } from "../../components/marketing/analytics-loader";
import { ConsentProvider } from "../../components/marketing/consent-provider";
import { CookieBanner } from "../../components/marketing/cookie-banner";
import { CookieSettingsModal } from "../../components/marketing/cookie-settings-modal";

/**
 * V2 Sprint 24 (onboarding) — surface distincte de `/app` (pas encore de session complète à
 * chaque étape) et de `(marketing)` (pas de Crisp/CTA commerciaux ici, mission : rester concentré
 * sur le wizard). `ConsentProvider`/`AnalyticsLoader`/`CookieBanner` sont réutilisés tels quels
 * (mission GA4 du funnel onboarding) — jamais `CrispLoader` : refuser le consentement Analytics
 * ne bloque JAMAIS la création de compte (CGU ≠ consentement cookies, jamais le même contrôle).
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <ConsentProvider>
      <div className="font-tenderos-body flex min-h-screen flex-col bg-tenderos-light text-tenderos-navy">
        <header className="border-b border-tenderos-navy/10 bg-white px-4 py-4 sm:px-6">
          <Link href="/" className="font-tenderos-display text-lg font-extrabold text-tenderos-navy">
            TenderOS
          </Link>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <CookieBanner />
      <CookieSettingsModal />
      <AnalyticsLoader />
    </ConsentProvider>
  );
}
