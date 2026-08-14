"use client";

import { useConsent } from "../../../../components/marketing/consent-provider";

export function CookieSettingsButton() {
  const { openSettings } = useConsent();
  return (
    <button type="button" onClick={openSettings} className="rounded-lg bg-tenderos-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90">
      Gérer mes préférences
    </button>
  );
}
