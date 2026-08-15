"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type LoginActionState } from "../actions";

const INITIAL_STATE: LoginActionState = {};

export function LoginForm({ returnTo, createAccountHref }: { returnTo: string; createAccountHref: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-6 shadow-sm sm:p-8">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-tenderos-navy">
          Email
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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-tenderos-navy">
            Mot de passe
          </label>
          <Link href="/app/forgot-password" className="text-xs font-medium text-tenderos-blue hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
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
      </div>

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
        {isPending ? "Connexion..." : "Se connecter"}
      </button>

      <p className="text-center text-sm text-tenderos-slate">
        Pas encore de compte ?{" "}
        <Link href={createAccountHref} className="font-semibold text-tenderos-blue hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
