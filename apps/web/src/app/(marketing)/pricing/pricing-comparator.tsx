import type { PublicPlanCatalogEntry, QuotaLimit } from "../../../lib/billing-types";

function formatLimit(limit: QuotaLimit): string {
  return limit === "UNLIMITED" ? "Illimité*" : String(limit);
}

const CHECK = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="mx-auto">
    <path d="M4 9.5L7.2 12.5L14 5.5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DASH = <span className="text-tenderos-navy/25">—</span>;

/**
 * V2 Sprint 25 (Pricing dédié) — mission §25.50 "Comparateur des offres... réutiliser les
 * Entitlements. Ne pas maintenir une deuxième matrice manuelle divergente." Les lignes
 * fonctionnelles (Analyse, Extraction, GO/NO-GO, Checklist, Bibliothèque, Mémoire technique, DOCX,
 * Administratif, Chiffrage, Package, Collaboration simple) sont incluses dans TOUS les paliers —
 * elles ne sont gated par AUCUN `EntitlementFeature`/`QuotaType` réel dans le domaine (vérifié dans
 * `plan-catalog.ts`) : les afficher comme "✓ partout" est donc la représentation FIDÈLE de l'état
 * réel, jamais une case cochée arbitrairement. Seules les lignes quota (AO/Users/Chat/Storage) et
 * entitlement (Collaboration avancée/Approvals/API/Webhooks/n8n-Make) varient réellement par palier,
 * et sont dérivées de `items` (jamais recopiées à la main).
 */
export function PricingComparator({ items }: { items: PublicPlanCatalogEntry[] }) {
  const pass = items.find((entry) => entry.tier === "PASS");
  const starter = items.find((entry) => entry.tier === "STARTER");
  const business = items.find((entry) => entry.tier === "BUSINESS");
  const enterprise = items.find((entry) => entry.tier === "ENTERPRISE");
  const plans = [
    { label: "Pass AO", entry: pass },
    { label: "Starter", entry: starter },
    { label: "Business", entry: business },
    { label: "Entreprise", entry: enterprise },
  ];

  const baselineFeatures = ["Analyse IA du DCE", "Extraction des exigences", "GO / NO-GO", "Checklist", "Bibliothèque intelligente", "Mémoire technique", "DOCX", "Administratif", "Chiffrage (BPU/DPGF/DQE)", "Package final", "Collaboration"];

  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <h2 className="font-tenderos-display text-center text-2xl font-extrabold text-tenderos-navy">Comparer les offres</h2>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-tenderos-navy/10">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-tenderos-navy/10 bg-tenderos-light">
              <th scope="col" className="px-4 py-3 text-left font-semibold text-tenderos-navy">
                Fonctionnalité
              </th>
              {plans.map((plan) => (
                <th key={plan.label} scope="col" className="px-4 py-3 text-center font-semibold text-tenderos-navy">
                  {plan.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ComparatorRow
              label="Crédits AO"
              values={plans.map((plan) => (plan.label === "Pass AO" ? "1 (unique)" : plan.entry ? `${formatLimit(plan.entry.quotas.AO_MONTHLY_GRANT)} / mois` : "—"))}
            />
            <ComparatorRow
              label="Report des crédits AO"
              values={plans.map((plan) => (plan.label === "Pass AO" ? DASH : plan.entry ? formatLimit(plan.entry.quotas.AO_ROLLOVER_CAP) : "—"))}
            />
            <ComparatorRow label="Utilisateurs" values={plans.map((plan) => (plan.entry ? formatLimit(plan.entry.quotas.USERS_MAX) : "—"))} />
            <ComparatorRow label="Chat IA / jour" values={plans.map((plan) => (plan.entry ? formatLimit(plan.entry.quotas.CHAT_AI_DAILY_MAX) : "—"))} />
            <ComparatorRow label="Stockage" values={plans.map((plan) => (plan.entry ? `${formatLimit(plan.entry.quotas.STORAGE_GB_MAX)} Go` : "—"))} />

            {baselineFeatures.map((feature) => (
              <ComparatorRow key={feature} label={feature} values={plans.map(() => CHECK)} />
            ))}

            <ComparatorRow label="Collaboration avancée" values={plans.map((plan) => (plan.entry?.entitlements.includes("ADVANCED_COLLABORATION") ? CHECK : DASH))} />
            <ComparatorRow label="Circuits de validation (Approvals)" values={plans.map((plan) => (plan.entry?.entitlements.includes("APPROVAL_WORKFLOWS") ? CHECK : DASH))} />
            <ComparatorRow label="API" values={plans.map((plan) => (plan.entry?.entitlements.includes("PUBLIC_API") ? CHECK : DASH))} />
            <ComparatorRow label="Webhooks" values={plans.map((plan) => (plan.entry?.entitlements.includes("WEBHOOKS") ? CHECK : DASH))} />
            <ComparatorRow label="n8n / Make" values={plans.map((plan) => (plan.entry?.entitlements.includes("AUTOMATION_CONNECTORS") ? CHECK : DASH))} />
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-xs text-tenderos-slate">*Fair use.</p>
    </section>
  );
}

const PLAN_LABELS = ["Pass AO", "Starter", "Business", "Entreprise"] as const;

function ComparatorRow({ label, values }: { label: string; values: React.ReactNode[] }) {
  return (
    <tr className="border-b border-tenderos-navy/5 last:border-0">
      <th scope="row" className="px-4 py-3 text-left font-normal text-tenderos-navy">
        {label}
      </th>
      {values.map((value, index) => (
        <td key={PLAN_LABELS[index]} className="px-4 py-3 text-center text-tenderos-slate">
          {value}
        </td>
      ))}
    </tr>
  );
}
