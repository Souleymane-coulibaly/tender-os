"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackEvent, type GaEventName, type GaEventParams } from "../../lib/analytics";

/**
 * V2 Sprint 23 (landing) — mission §47 "Client Components uniquement pour... les interactions
 * nécessaires" : seul point client des sections par ailleurs statiques (Hero, Pricing, CTA final)
 * qui ont besoin d'un événement GA4 au clic (mission §35), jamais toute la section.
 */
export function TrackedLink({
  href,
  event,
  params,
  className,
  children,
}: {
  href: string;
  event: GaEventName;
  params?: GaEventParams | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Link href={href} onClick={() => trackEvent(event, params)} className={className}>
      {children}
    </Link>
  );
}
