"use client";

import { useState } from "react";
import { createCheckoutSessionAction, createCustomerPortalSessionAction, type CheckoutTarget } from "../../billing-actions";

type Props =
  | { kind: "checkout"; target: CheckoutTarget; label: string; className?: string }
  | { kind: "portal"; label: string; className?: string };

const DEFAULT_CLASS = "rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50";

/**
 * V2 Sprint 22 (billing, étape 22D) — jamais de redirection construite côté client : l'URL vient
 * TOUJOURS de la réponse serveur (`createCheckoutSessionAction`/`createCustomerPortalSessionAction`,
 * elles-mêmes résolues côté API depuis `APP_BASE_URL`/Stripe, correctif audit Codex 22C P1-03).
 */
export function CheckoutButton(props: Props) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleClick() {
    setIsPending(true);
    setError(undefined);
    const result = props.kind === "checkout" ? await createCheckoutSessionAction(props.target) : await createCustomerPortalSessionAction();
    if (result.error || !result.url) {
      setError(result.error ?? "Une erreur est survenue.");
      setIsPending(false);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={handleClick} disabled={isPending} className={props.className ?? DEFAULT_CLASS}>
        {isPending ? "Redirection..." : props.label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
