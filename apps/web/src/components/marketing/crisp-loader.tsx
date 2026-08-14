"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { CRISP_WEBSITE_ID } from "../../lib/crisp";
import { useConsent } from "./consent-provider";

/**
 * V2 Sprint 23 (landing) — mission §29/§30/§31. Sans rendu visuel (le widget lui-même est injecté
 * par le script Crisp). Monté UNIQUEMENT après consentement Support accordé. Un retrait de
 * consentement (Support ON -> OFF) recharge la page : Crisp n'expose aucune API de désinstallation
 * propre une fois le widget injecté dans le DOM (voir `lib/crisp.ts`) — seule façon fiable de
 * garantir qu'aucune trace ne subsiste (mission §62).
 */
export function CrispLoader() {
  const { consent } = useConsent();
  const supportGranted = consent?.support === true;
  const wasGranted = useRef(supportGranted);

  useEffect(() => {
    if (wasGranted.current && !supportGranted) {
      window.location.reload();
      return;
    }
    wasGranted.current = supportGranted;
  }, [supportGranted]);

  if (!CRISP_WEBSITE_ID || !supportGranted) return null;

  return (
    <>
      {/* La configuration DOIT s'exécuter AVANT le chargement de l.js (Crisp lit
          `window.CRISP_WEBSITE_ID` à SON exécution, pas après) — même motif que le snippet
          d'intégration officiel Crisp. `CRISP_WEBSITE_ID` est une variable `NEXT_PUBLIC_*` déjà
          inlinée au build, jamais une saisie utilisateur. */}
      <Script id="crisp-config" strategy="afterInteractive">
        {`window.$crisp = []; window.CRISP_WEBSITE_ID = ${JSON.stringify(CRISP_WEBSITE_ID)};`}
      </Script>
      <Script id="crisp-loader" src="https://client.crisp.chat/l.js" strategy="afterInteractive" />
    </>
  );
}
