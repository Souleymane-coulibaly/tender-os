"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type ForgotPasswordActionState } from "../actions";

const INITIAL_STATE: ForgotPasswordActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, INITIAL_STATE);

  if (state.submitted) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-tenderos-slate">
          Si un compte existe pour cette adresse, un email contenant un lien de réinitialisation vient de vous être
          envoyé. Le lien expire dans 30 minutes.
        </p>
        <Link href="/app/login" className="text-sm font-semibold text-tenderos-blue hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
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

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90 disabled:opacity-50"
      >
        {isPending ? "Envoi..." : "Envoyer le lien de réinitialisation"}
      </button>

      <Link href="/app/login" className="text-center text-sm text-tenderos-slate hover:underline">
        Retour à la connexion
      </Link>
    </form>
  );
}
