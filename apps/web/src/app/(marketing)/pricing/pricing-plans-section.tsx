"use client";

import { useState } from "react";
import { formatEurosFromCents, type BillingInterval, type PublicPlanCatalogEntry, type QuotaLimit } from "../../../lib/billing-types";
import { GA_EVENTS, trackEvent, type GaEventName } from "../../../lib/analytics";
import { getPlanCtaHref } from "../../../lib/plan-cta";
import { formatProjectedTrialEndDate, STARTER_TRIAL_DAYS } from "../../../lib/trial-policy";
import { TrackedLink } from "../../../components/marketing/tracked-link";

function formatLimit(limit: QuotaLimit): string {
  return limit === "UNLIMITED" ? "illimité*" : String(limit);
}

function buildBullets(entry: PublicPlanCatalogEntry): string[] {
  const q = entry.quotas;
  const bullets: string[] = [];

  if (q.AO_MONTHLY_GRANT === "UNLIMITED") {
    bullets.push("Crédits AO illimités*");
  } else if (q.AO_MONTHLY_GRANT > 0) {
    bullets.push(`+${q.AO_MONTHLY_GRANT} crédits AO / mois`);
    bullets.push(`Report max ${formatLimit(q.AO_ROLLOVER_CAP)} AO`);
  }

  bullets.push(q.USERS_MAX === "UNLIMITED" ? "Utilisateurs illimités*" : `${q.USERS_MAX} utilisateurs`);
  bullets.push(`${formatLimit(q.CHAT_AI_DAILY_MAX)} Chat IA / jour`);
  bullets.push(`${formatLimit(q.STORAGE_GB_MAX)} Go de stockage`);

  if (entry.entitlements.includes("ADVANCED_COLLABORATION")) bullets.push("Collaboration avancée");
  if (entry.entitlements.includes("APPROVAL_WORKFLOWS")) bullets.push("Circuits de validation");
  if (entry.entitlements.includes("PUBLIC_API")) bullets.push("API");
  if (entry.entitlements.includes("WEBHOOKS")) bullets.push("Webhooks");
  if (entry.entitlements.includes("AUTOMATION_CONNECTORS")) bullets.push("n8n / Make");

  return bullets;
}

/**
 * V2 Sprint 25 (Pricing dédié) — remplace `(marketing)/pricing-section.tsx` (retiré de la Landing,
 * mission §25.33) : `/pricing` (Sprint 25B) en devient l'unique consommatrice, mission §25.32
 * "/pricing devient la référence commerciale publique". `items` provient toujours de
 * `GET /api/v1/billing/plan-catalog` (mission §25.52 "Source of Truth Pricing", jamais un second
 * catalogue). La carte Starter porte désormais le message Trial (mission §25.5/§25.45), les autres
 * cartes restent inchangées dans leur mécanique.
 */
export function PricingPlansSection({ items }: { items: PublicPlanCatalogEntry[] }) {
  const [interval, setInterval] = useState<Lowercase<BillingInterval>>("monthly");
  const pass = items.find((entry) => entry.tier === "PASS");
  const starter = items.find((entry) => entry.tier === "STARTER");
  const business = items.find((entry) => entry.tier === "BUSINESS");
  const enterprise = items.find((entry) => entry.tier === "ENTERPRISE");

  function handleToggle(next: Lowercase<BillingInterval>) {
    setInterval(next);
    trackEvent(next === "yearly" ? GA_EVENTS.AnnualPricingSelected : GA_EVENTS.MonthlyPricingSelected);
  }

  function priceFor(entry: PublicPlanCatalogEntry | undefined): { amount: string; period: string } {
    if (!entry) return { amount: "—", period: "" };
    const cents = interval === "yearly" ? entry.yearlyPriceCents : entry.monthlyPriceCents;
    if (cents === null) return { amount: "—", period: "" };
    return { amount: formatEurosFromCents(cents), period: interval === "yearly" ? "HT / an" : "HT / mois" };
  }

  const starterPrice = priceFor(starter);
  const projectedTrialEndDate = formatProjectedTrialEndDate();

  return (
    <section id="offres" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="flex items-center justify-center gap-2">
        <div className="inline-flex rounded-lg border border-tenderos-navy/15 p-1">
          <button
            type="button"
            onClick={() => handleToggle("monthly")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${interval === "monthly" ? "bg-tenderos-navy text-white" : "text-tenderos-navy"}`}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => handleToggle("yearly")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${interval === "yearly" ? "bg-tenderos-navy text-white" : "text-tenderos-navy"}`}
          >
            Annuel
          </button>
        </div>
        <span className="rounded-full bg-tenderos-gold/15 px-3 py-1 text-xs font-bold text-tenderos-navy">-1 mois offert</span>
      </div>
      <p className="mt-2 text-center text-xs text-tenderos-slate">{interval === "monthly" ? "Sans engagement" : "1 mois offert"}</p>

      <div className="mt-10 grid gap-6 lg:grid-cols-5">
        {/* Pass AO — mission §25.44, jamais un abonnement, texte largement fixe (le mécanisme Pass
            n'est pas modélisé par des quotas côté domaine, voir plan-catalog.ts). */}
        <PricingCard title="Pass AO" price={pass ? formatEurosFromCents(pass.onePriceCents ?? 0) : "—"} period="HT — Paiement unique" description="Pour répondre ponctuellement à un appel d'offres.">
          <Bullets items={["1 crédit AO", "Fonctionnalités métier Starter", "Accès limité au dossier acheté", "Pas d'abonnement"]} />
          <CtaButton href={getPlanCtaHref("pass")} event={GA_EVENTS.PassAoClicked} variant="secondary">
            Acheter un Pass
          </CtaButton>
        </PricingCard>

        {/* Starter — mission §25.5/§25.45 : SEUL palier avec Trial (mission §25.2, jamais Pass/
            Business/Enterprise/Conseil). Le badge, la date projetée et la mention de résiliation ne
            s'affichent QUE sur cette carte. */}
        <PricingCard
          title="Starter"
          price={starterPrice.amount}
          period={starterPrice.period}
          description="Pour démarrer et structurer vos réponses."
          badge={`${STARTER_TRIAL_DAYS} JOURS D'ESSAI GRATUIT`}
        >
          <p className="text-xs text-tenderos-slate">à partir du {projectedTrialEndDate}</p>
          <Bullets items={starter ? buildBullets(starter) : []} />
          {/* mission §25.92 — événement Trial dédié, distinct de `PricingPlanSelected` (Business/Enterprise). */}
          <CtaButton href={getPlanCtaHref("starter", interval)} event={GA_EVENTS.StarterTrialSelected} params={{ billing: interval }} variant="secondary">
            Démarrer mon essai gratuit
          </CtaButton>
          <p className="mt-2 text-center text-[11px] text-tenderos-slate">Carte bancaire requise · Aucun débit aujourd&apos;hui</p>
          <p className="mt-1 text-center text-[11px] text-tenderos-slate">Vous pouvez résilier avant cette date pour ne pas être débité.</p>
        </PricingCard>

        <PricingCard
          title="Business"
          price={priceFor(business).amount}
          period={priceFor(business).period}
          description="Pour les équipes qui veulent accélérer et collaborer."
          highlight
        >
          <Bullets items={business ? buildBullets(business) : []} />
          <CtaButton href={getPlanCtaHref("business", interval)} event={GA_EVENTS.PricingPlanSelected} params={{ plan: "business", billing: interval }} variant="primary">
            Choisir Business
          </CtaButton>
        </PricingCard>

        <PricingCard title="Entreprise" price={priceFor(enterprise).amount} period={priceFor(enterprise).period} description="Pour les entreprises avec des besoins avancés.">
          <Bullets items={enterprise ? buildBullets(enterprise) : []} />
          <CtaButton href={getPlanCtaHref("enterprise", interval)} event={GA_EVENTS.PricingPlanSelected} params={{ plan: "enterprise", billing: interval }} variant="secondary">
            Choisir Entreprise
          </CtaButton>
        </PricingCard>

        {/* Conseil — mission §25.48, jamais un PlanTier côté domaine (sur devis, sans quota SaaS
            automatique) : contenu entièrement statique, jamais tiré du catalogue. */}
        <PricingCard title="Conseil" price="Sur devis" period="" description="Accompagnement personnalisé et besoins spécifiques.">
          <Bullets items={["Accompagnement sur mesure", "Formation", "Intégrations spécifiques", "Support prioritaire"]} />
          <CtaButton href={getPlanCtaHref("conseil")} event={GA_EVENTS.ContactClicked} variant="secondary">
            Nous contacter
          </CtaButton>
        </PricingCard>
      </div>

      <p className="mt-8 text-center text-xs text-tenderos-slate">Tous les prix sont HT. Engagement sans frais de résiliation. *Fair use.</p>
    </section>
  );
}

function PricingCard({
  title,
  price,
  period,
  description,
  highlight,
  badge,
  children,
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  highlight?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl border p-7 ${highlight ? "border-tenderos-gold bg-tenderos-navy text-white shadow-xl" : "border-tenderos-navy/10 bg-white shadow-sm"}`}>
      {highlight ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-tenderos-gold px-3 py-1 text-xs font-bold text-tenderos-navy">RECOMMANDÉ</span>
      ) : badge ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-tenderos-navy px-3 py-1 text-[11px] font-bold text-white">{badge}</span>
      ) : null}
      <h3 className={`font-tenderos-display text-lg font-bold ${highlight ? "text-white" : "text-tenderos-navy"}`}>{title}</h3>
      <p className={`mt-1 text-xs ${highlight ? "text-white/70" : "text-tenderos-slate"}`}>{description}</p>
      <p className={`mt-4 text-3xl font-extrabold ${highlight ? "text-white" : "text-tenderos-navy"}`}>{price}</p>
      {period ? <p className={`text-xs ${highlight ? "text-white/60" : "text-tenderos-slate"}`}>{period}</p> : null}
      <div className="mt-5 flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex-1 space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span aria-hidden="true">✓</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CtaButton({
  href,
  event,
  params,
  variant,
  children,
}: {
  href: string;
  event: GaEventName;
  params?: Record<string, string> | undefined;
  variant: "primary" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <TrackedLink
      href={href}
      event={event}
      params={params}
      className={`mt-3 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
        variant === "primary" ? "bg-tenderos-gold text-tenderos-navy hover:bg-tenderos-gold-light" : "bg-tenderos-navy text-white hover:bg-tenderos-navy/90"
      }`}
    >
      {children}
    </TrackedLink>
  );
}
