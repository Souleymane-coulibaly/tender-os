"use client";

import { useState } from "react";
import { startOnboardingCheckoutAction } from "../onboarding-actions";
import type { CheckoutTarget } from "../../app/billing-actions";
import { GA_EVENTS, trackEvent } from "../../../lib/analytics";

export function CheckoutLaunchButton({ target, label }: { target: CheckoutTarget; label: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleClick() {
    setIsPending(true);
    setError(undefined);
    trackEvent(GA_EVENTS.CheckoutStarted);
    const result = await startOnboardingCheckoutAction(target);
    if (result.error || !result.url) {
      setError(result.error ?? "Une erreur est survenue.");
      setIsPending(false);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-tenderos-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90 disabled:opacity-50"
      >
        {isPending ? "Redirection vers Stripe..." : label}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
