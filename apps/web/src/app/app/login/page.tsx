import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY } from "../../../lib/legal-entity";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — TenderOS", robots: { index: false, follow: false } };

const BENEFITS = [
  "Détectez les appels d'offres pertinents automatiquement",
  "Générez vos dossiers de réponse avec l'IA",
  "Suivez chaque appel d'offres en équipe, du repérage à la remise",
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * V2 Sprint 24 (refonte /app/login) — mise en page à deux zones : branding/bénéfices à gauche
 * (masqué en mobile, non prioritaire), carte de connexion à droite (toujours visible en premier
 * sur mobile). `plan`/`billing`/`offer` sont conservés vers "Créer un compte" (mission) ;
 * `returnTo` est lu ici et transmis tel quel au formulaire — sa validation (chemin interne
 * uniquement) reste entièrement côté serveur dans `loginAction` (jamais une confiance côté client).
 */
export default async function AppLoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const returnTo = firstValue(params.returnTo) ?? "";

  const createAccountParams = new URLSearchParams();
  const offer = firstValue(params.offer);
  const plan = firstValue(params.plan);
  const billing = firstValue(params.billing);
  if (offer) createAccountParams.set("offer", offer);
  if (plan) createAccountParams.set("plan", plan);
  if (billing) createAccountParams.set("billing", billing);
  const createAccountQuery = createAccountParams.toString();
  const createAccountHref = `/onboarding${createAccountQuery ? `?${createAccountQuery}` : ""}`;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-tenderos-navy p-10 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_60%)]" aria-hidden="true" />
        {/* Logo officiel, variante `-dark` (texte blanc + « OS » or) conçue pour le fond navy — même
            asset que le menu latéral et le pied de page du site. */}
        <Link href="/" aria-label="TenderOS" className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel */}
          <img src="/brand/tenderos-logo-horizontal-dark.svg" alt="TenderOS" className="h-8 w-auto" width={220} height={48} />
        </Link>
        <div className="relative flex flex-col gap-6">
          <p className="font-tenderos-display text-3xl font-bold leading-tight">Le système d&apos;exploitation des appels d&apos;offres.</p>
          <ul className="flex flex-col gap-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-white/85">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
                  <circle cx="9" cy="9" r="8" stroke="#F4C95D" strokeWidth="1.5" />
                  <path d="M5.5 9.2L7.7 11.4L12.5 6.6" stroke="#F4C95D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} {LEGAL_ENTITY.name} — {LEGAL_ENTITY.product}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 bg-tenderos-light px-4 py-12 sm:px-6">
        <Link href="/" aria-label="TenderOS" className="lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel */}
          <img src="/brand/tenderos-logo-horizontal.svg" alt="TenderOS" className="h-8 w-auto" width={220} height={48} />
        </Link>
        <div className="flex w-full max-w-sm flex-col gap-1 text-center">
          <h1 className="font-tenderos-display text-2xl font-bold text-tenderos-navy">Connexion</h1>
          <p className="text-sm text-tenderos-slate">Accédez à votre espace TenderOS.</p>
        </div>

        <LoginForm returnTo={returnTo} createAccountHref={createAccountHref} />

        <Link href="/" className="text-sm text-tenderos-slate hover:underline">
          ← Retour au site
        </Link>
      </div>
    </div>
  );
}
