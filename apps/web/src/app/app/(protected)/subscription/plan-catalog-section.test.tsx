import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanCatalogSection } from "./plan-catalog-section";
import type { PublicPlanCatalogEntry } from "../../../../lib/billing-types";

vi.mock("../../billing-actions", () => ({
  createCheckoutSessionAction: vi.fn(async () => ({ url: "https://checkout.stripe.com/test" })),
  createCustomerPortalSessionAction: vi.fn(async () => ({ url: "https://billing.stripe.com/test" })),
}));

const CATALOG: PublicPlanCatalogEntry[] = [
  { tier: "PASS", displayName: "Pass AO", billingIntervalsSupported: [], monthlyPriceCents: null, yearlyPriceCents: null, onePriceCents: 9900, entitlements: [], quotas: { AO_MONTHLY_GRANT: 0, AO_ROLLOVER_CAP: 0, USERS_MAX: 1, CHAT_AI_DAILY_MAX: 0, STORAGE_GB_MAX: 1 } },
  {
    tier: "STARTER",
    displayName: "Starter",
    billingIntervalsSupported: ["MONTHLY", "YEARLY"],
    monthlyPriceCents: 19900,
    yearlyPriceCents: 218900,
    onePriceCents: null,
    entitlements: [],
    quotas: { AO_MONTHLY_GRANT: 2, AO_ROLLOVER_CAP: 2, USERS_MAX: 2, CHAT_AI_DAILY_MAX: 10, STORAGE_GB_MAX: 5 },
  },
  {
    tier: "BUSINESS",
    displayName: "Business",
    billingIntervalsSupported: ["MONTHLY", "YEARLY"],
    monthlyPriceCents: 59900,
    yearlyPriceCents: 658900,
    onePriceCents: null,
    entitlements: ["ADVANCED_COLLABORATION", "APPROVAL_WORKFLOWS"],
    quotas: { AO_MONTHLY_GRANT: 10, AO_ROLLOVER_CAP: 20, USERS_MAX: 10, CHAT_AI_DAILY_MAX: 50, STORAGE_GB_MAX: 50 },
  },
  {
    tier: "ENTERPRISE",
    displayName: "Enterprise",
    billingIntervalsSupported: ["MONTHLY", "YEARLY"],
    monthlyPriceCents: 109900,
    yearlyPriceCents: 1208900,
    onePriceCents: null,
    entitlements: ["ADVANCED_COLLABORATION", "APPROVAL_WORKFLOWS", "PUBLIC_API", "WEBHOOKS", "AUTOMATION_CONNECTORS"],
    quotas: { AO_MONTHLY_GRANT: "UNLIMITED", AO_ROLLOVER_CAP: "UNLIMITED", USERS_MAX: "UNLIMITED", CHAT_AI_DAILY_MAX: 300, STORAGE_GB_MAX: 300 },
  },
];

/**
 * Checkpoint TENDEROS-2.1-P2.3-E8 (mission §26 test matrix) — corrige la cause racine du bug
 * produit "un utilisateur ne peut choisir que Starter" : cette section doit toujours montrer
 * Starter/Business/Enterprise depuis le VRAI catalogue, jamais un JSX à 3 forfaits codés en dur.
 */
describe("PlanCatalogSection", () => {
  it("BLOQUANT — Starter trial (or any subscribed org) sees Starter, Business AND Enterprise, never only the current plan", () => {
    render(<PlanCatalogSection catalog={CATALOG} currentPlanTier="STARTER" hasAnySubscription canManage />);

    expect(screen.getByRole("heading", { name: "Starter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Business" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enterprise" })).toBeInTheDocument();
    // Pass AO n'est jamais mélangé aux paliers d'abonnement (mission §12).
    expect(screen.queryByRole("heading", { name: "Pass AO" })).not.toBeInTheDocument();
  });

  it("marks the current plan as 'Plan actuel' (never a 'Souscrire'/'Passer à' CTA on its own card)", () => {
    render(<PlanCatalogSection catalog={CATALOG} currentPlanTier="STARTER" hasAnySubscription canManage />);

    const starterHeading = screen.getByRole("heading", { name: "Starter" });
    const starterCard = starterHeading.closest("section") as HTMLElement;
    // "Plan actuel" apparaît deux fois volontairement (badge d'en-tête + zone CTA remplacée) —
    // jamais un bouton "Passer à Starter" sur sa propre carte.
    expect(within(starterCard).getAllByText("Plan actuel")).toHaveLength(2);
    expect(within(starterCard).queryByRole("button", { name: /Passer à/ })).not.toBeInTheDocument();
  });

  it("BLOQUANT — an org WITH an active subscription gets upgrade CTAs routed through the Stripe portal (never a second Checkout Session, which would create a duplicate Stripe subscription)", async () => {
    const { createCheckoutSessionAction, createCustomerPortalSessionAction } = await import("../../billing-actions");
    render(<PlanCatalogSection catalog={CATALOG} currentPlanTier="STARTER" hasAnySubscription canManage />);

    const businessHeading = screen.getByRole("heading", { name: "Business" });
    const businessCard = businessHeading.closest("section") as HTMLElement;
    fireEvent.click(within(businessCard).getByRole("button", { name: "Passer à Business" }));

    await vi.waitFor(() => expect(createCustomerPortalSessionAction).toHaveBeenCalled());
    expect(createCheckoutSessionAction).not.toHaveBeenCalled();
  });

  it("BLOQUANT — an org with NO subscription gets a direct checkout CTA (safe: no existing Stripe subscription to duplicate)", async () => {
    const { createCheckoutSessionAction } = await import("../../billing-actions");
    render(<PlanCatalogSection catalog={CATALOG} currentPlanTier={null} hasAnySubscription={false} canManage />);

    const businessHeading = screen.getByRole("heading", { name: "Business" });
    const businessCard = businessHeading.closest("section") as HTMLElement;
    fireEvent.click(within(businessCard).getByRole("button", { name: "Passer à Business" }));

    await vi.waitFor(() => expect(createCheckoutSessionAction).toHaveBeenCalledWith({ kind: "SUBSCRIPTION", planTier: "BUSINESS", billingInterval: "MONTHLY" }));
  });

  it("BLOQUANT — an actor without billing-manage permission sees the comparison but no CTA at all (masking is UX only — backend re-validates independently)", () => {
    render(<PlanCatalogSection catalog={CATALOG} currentPlanTier="STARTER" hasAnySubscription canManage={false} />);

    expect(screen.getByRole("heading", { name: "Business" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Passer à/ })).not.toBeInTheDocument();
  });

  it("switches displayed prices when the Monthly/Annual toggle is used (real interval, never a second price source)", () => {
    render(<PlanCatalogSection catalog={CATALOG} currentPlanTier="STARTER" hasAnySubscription canManage />);

    expect(screen.getByText(/599\s*€/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuel" }));
    expect(screen.getByText(/6\s*589\s*€/)).toBeInTheDocument();
  });
});
