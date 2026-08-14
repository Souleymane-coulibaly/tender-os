"use client";

import { useActionState, useEffect } from "react";
import { GA_EVENTS, trackEvent } from "../../../lib/analytics";
import { submitDemoRequestAction, type DemoRequestActionState } from "../marketing-actions";

const INITIAL_STATE: DemoRequestActionState = {};

export function ContactForm({ prefillMessage }: { prefillMessage?: string | undefined }) {
  const [state, formAction, isPending] = useActionState(submitDemoRequestAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) {
      trackEvent(GA_EVENTS.DemoRequestSubmitted);
    }
  }, [state.success]);

  if (state.success) {
    return (
      <div role="status" className="rounded-2xl border border-tenderos-navy/10 bg-tenderos-light p-8 text-center">
        <p className="font-tenderos-display text-lg font-bold text-tenderos-navy">Merci, votre demande a bien été envoyée.</p>
        <p className="mt-2 text-sm text-tenderos-slate">Notre équipe revient vers vous très rapidement.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Honeypot anti-spam — jamais visible pour un humain (mission §27 "protection anti-spam raisonnable"). */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label htmlFor="website">Site web</label>
        <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="name" className="text-sm font-semibold text-tenderos-navy">Nom</label>
        <input id="name" name="name" required maxLength={160} className="mt-1 w-full rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-tenderos-navy">Email professionnel</label>
        <input id="email" name="email" type="email" required maxLength={320} className="mt-1 w-full rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="company" className="text-sm font-semibold text-tenderos-navy">Entreprise</label>
        <input id="company" name="company" required maxLength={200} className="mt-1 w-full rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="phone" className="text-sm font-semibold text-tenderos-navy">Téléphone <span className="font-normal text-tenderos-slate">(optionnel)</span></label>
        <input id="phone" name="phone" type="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="message" className="text-sm font-semibold text-tenderos-navy">Message <span className="font-normal text-tenderos-slate">(optionnel)</span></label>
        <textarea id="message" name="message" rows={4} maxLength={2000} defaultValue={prefillMessage} className="mt-1 w-full rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm" />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-tenderos-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90 disabled:opacity-60"
      >
        {isPending ? "Envoi en cours…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}
