"use client";

import { useState } from "react";
import {
  createCheckoutSessionAction,
  createCustomerPortalSessionAction,
  createPlanChangeSessionAction,
  type CheckoutTarget,
} from "../../billing-actions";
import type { BillingInterval, SubscriptionPlanTier } from "../../../../lib/billing-types";

type Props =
  | { kind: "checkout"; target: CheckoutTarget; label: string; className?: string }
  | { kind: "plan-change"; planTier: SubscriptionPlanTier; billingInterval: BillingInterval; label: string; className?: string }
  | { kind: "portal"; label: string; className?: string };

function openSession(props: Props) {
  switch (props.kind) {
    case "checkout":
      return createCheckoutSessionAction(props.target);
    case "plan-change":
      return createPlanChangeSessionAction(props.planTier, props.billingInterval);
    case "portal":
      return createCustomerPortalSessionAction();
  }
}

const DEFAULT_CLASS = "rounded-lg bg-tenderos-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-tenderos-navy/90 disabled:opacity-50";

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
    const result = await openSession(props);
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
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
