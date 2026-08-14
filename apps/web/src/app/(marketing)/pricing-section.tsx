"use client";

import { useState } from "react";
import { formatEurosFromCents, type BillingInterval, type PublicPlanCatalogEntry, type QuotaLimit } from "../../lib/billing-types";
import { GA_EVENTS, trackEvent, type GaEventName } from "../../lib/analytics";
import { getPlanCtaHref } from "../../lib/plan-cta";
import { TrackedLink } from "../../components/marketing/tracked-link";

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
 * V2 Sprint 23 (landing) — mission §17 "NE PAS recréer une deuxième source de vérité Pricing" :
 * `items` provient de `GET /api/v1/billing/plan-catalog` (fetch côté serveur dans `page.tsx`),
 * jamais un montant recalculé ici (mission §23 "ne pas recalculer monthly × 11 si le catalogue
 * existe déjà" — `yearlyPriceCents` est déjà la valeur réelle du catalogue).
 */
export function PricingSection({ items }: { items: PublicPlanCatalogEntry[] }) {
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

  return (
    <section id="tarifs" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="font-tenderos-display text-center text-3xl font-extrabold text-tenderos-navy">Des offres adaptées à chaque organisation</h2>

      <div className="mt-8 flex items-center justify-center gap-2">
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

      <div className="mt-10 grid gap-5 lg:grid-cols-5">
        {/* Pass AO — mission §18, jamais un abonnement, texte largement fixe (le mécanisme Pass
            n'est pas modélisé par des quotas côté domaine, voir plan-catalog.ts). */}
        <PricingCard title="Pass AO" price={pass ? formatEurosFromCents(pass.onePriceCents ?? 0) : "—"} period="HT — Paiement unique" description="Pour répondre ponctuellement à un appel d'offres.">
          <Bullets items={["1 crédit AO", "Fonctionnalités métier Starter", "Accès limité au dossier acheté", "Pas d'abonnement"]} />
          <CtaButton href={getPlanCtaHref("pass")} event={GA_EVENTS.PassAoClicked} variant="secondary">
            Acheter un Pass
          </CtaButton>
        </PricingCard>

        <PricingCard title="Starter" price={priceFor(starter).amount} period={priceFor(starter).period} description="Pour démarrer et structurer vos réponses.">
          <Bullets items={starter ? buildBullets(starter) : []} />
          <CtaButton href={getPlanCtaHref("starter", interval)} event={GA_EVENTS.PricingPlanSelected} params={{ plan: "starter", billing: interval }} variant="secondary">
            Choisir Starter
          </CtaButton>
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

        {/* Conseil — mission §22, jamais un PlanTier côté domaine (sur devis, sans quota SaaS
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
  children,
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl border p-6 ${highlight ? "border-tenderos-gold bg-tenderos-navy text-white shadow-xl" : "border-tenderos-navy/10 bg-white"}`}>
      {highlight ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-tenderos-gold px-3 py-1 text-xs font-bold text-tenderos-navy">RECOMMANDÉ</span>
      ) : null}
      <h3 className={`font-tenderos-display text-lg font-bold ${highlight ? "text-white" : "text-tenderos-navy"}`}>{title}</h3>
      <p className={`mt-1 text-xs ${highlight ? "text-white/70" : "text-tenderos-slate"}`}>{description}</p>
      <p className={`mt-4 text-3xl font-extrabold ${highlight ? "text-white" : "text-tenderos-navy"}`}>{price}</p>
      {period ? <p className={`text-xs ${highlight ? "text-white/60" : "text-tenderos-slate"}`}>{period}</p> : null}
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
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
      className={`mt-5 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
        variant === "primary" ? "bg-tenderos-gold text-tenderos-navy hover:bg-tenderos-gold-light" : "bg-tenderos-navy text-white hover:bg-tenderos-navy/90"
      }`}
    >
      {children}
    </TrackedLink>
  );
}
