"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GA_EVENTS, trackEvent } from "../../../lib/analytics";
import { fetchOnboardingPaymentStatus } from "../onboarding-actions";

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

/**
 * Mission : ne jamais faire confiance à l'URL de retour Stripe (`?checkout=success`) comme preuve
 * de paiement — uniquement `GET /billing/subscription`/Pass (via `fetchOnboardingPaymentStatus`,
 * la seule autorité réelle, alimentée par le webhook Stripe). Le retour "success" ouvre seulement
 * cette fenêtre d'attente ; le webhook peut arriver quelques secondes après la redirection.
 */
export function PaymentStatusPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const cancelled = useRef(false);
  // Compteur interne pur (jamais affiché) — une ref plutôt qu'un state évite un re-render à
  // chaque tick pour une valeur qui ne pilote que la logique d'arrêt du poll.
  const attempts = useRef(0);

  useEffect(() => {
    cancelled.current = false;

    async function poll() {
      const status = await fetchOnboardingPaymentStatus();
      if (cancelled.current) return;

      if (status.hasPlan) {
        // mission §25.92 — uniquement pour un Trial réellement confirmé côté serveur (webhook
        // Stripe déjà traité, jamais l'URL de retour comme preuve — voir le commentaire au sommet
        // de ce fichier), jamais pour un Pass ou un abonnement direct sans essai.
        if (status.subscriptionStatus === "TRIALING") {
          trackEvent(GA_EVENTS.StarterTrialStarted);
        }
        // Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — l'étape Équipe s'insère ici,
        // entre le paiement confirmé et la configuration/bienvenue (mission §16 : facultative, jamais
        // un gate de reprise — voir la docstring de `/onboarding/equipe`).
        router.push("/onboarding/equipe");
        return;
      }

      attempts.current += 1;
      if (attempts.current >= MAX_ATTEMPTS) {
        setTimedOut(true);
      } else {
        window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();

    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-tenderos-slate">
          La confirmation du paiement prend plus de temps que prévu. Si le paiement a bien été effectué, actualisez cette page dans quelques instants.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-tenderos-navy/20 px-4 py-2 text-sm font-semibold text-tenderos-navy hover:bg-tenderos-light"
        >
          Actualiser
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-tenderos-navy/20 border-t-tenderos-navy" aria-hidden="true" />
      <p className="text-sm text-tenderos-slate">Confirmation du paiement en cours...</p>
    </div>
  );
}
