"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registerAccountAction, type AccountStepState } from "../onboarding-actions";

const INITIAL_STATE: AccountStepState = {};

export function CompteForm({ queryString }: { queryString: string }) {
  const [state, formAction, isPending] = useActionState(registerAccountAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-6 shadow-sm sm:p-8">
      <input type="hidden" name="queryString" value={queryString} />

      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium text-tenderos-navy">
          Nom complet
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm text-tenderos-navy focus:border-tenderos-blue focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-tenderos-navy">
          Email professionnel
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm text-tenderos-navy focus:border-tenderos-blue focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-tenderos-navy">
          Mot de passe
        </label>
        <div className="flex items-center gap-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm text-tenderos-navy focus:border-tenderos-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="shrink-0 text-xs font-medium text-tenderos-slate hover:text-tenderos-navy"
            aria-pressed={showPassword}
          >
            {showPassword ? "Masquer" : "Afficher"}
          </button>
        </div>
        <p className="text-xs text-tenderos-slate">8 caractères minimum.</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-tenderos-navy/10 bg-tenderos-light/60 p-3">
        <input
          id="termsAccepted"
          name="termsAccepted"
          type="checkbox"
          required
          aria-required="true"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-tenderos-navy/30 text-tenderos-blue focus:ring-tenderos-blue"
        />
        <label htmlFor="termsAccepted" className="text-sm text-tenderos-navy">
          J&apos;accepte les{" "}
          <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-tenderos-blue hover:underline">
            Conditions Générales d&apos;Utilisation
          </Link>
          .
        </label>
      </div>
      <p className="-mt-2 text-xs text-tenderos-slate">
        Consultez aussi notre{" "}
        <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-tenderos-navy">
          politique de confidentialité
        </Link>
        .
      </p>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-tenderos-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90 disabled:opacity-50"
      >
        {isPending ? "Création du compte..." : "Créer mon compte"}
      </button>

      <p className="text-center text-sm text-tenderos-slate">
        Déjà un compte ?{" "}
        <Link href={`/app/login${queryString}`} className="font-semibold text-tenderos-blue hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
