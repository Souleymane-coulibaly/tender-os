"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { resetPasswordAction, type ResetPasswordActionState } from "../actions";

const INITIAL_STATE: ResetPasswordActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const boundAction = resetPasswordAction.bind(null, token);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-tenderos-slate">
          Votre mot de passe a été mis à jour. Vos sessions précédentes ont été déconnectées par sécurité.
        </p>
        <Link
          href="/app/login"
          className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="newPassword" className="text-sm font-medium text-tenderos-navy">
          Nouveau mot de passe
        </label>
        <div className="flex items-center gap-2">
          <input
            id="newPassword"
            name="newPassword"
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

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-tenderos-navy">
          Confirmer le mot de passe
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
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
        {isPending ? "Mise à jour..." : "Réinitialiser le mot de passe"}
      </button>
    </form>
  );
}
