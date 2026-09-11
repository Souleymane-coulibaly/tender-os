"use client";

import { useActionState } from "react";
import { createOrganizationAction, type OrganizationStepState } from "../onboarding-actions";

const INITIAL_STATE: OrganizationStepState = {};

export function EntrepriseForm({ queryString }: { queryString: string }) {
  const [state, formAction, isPending] = useActionState(createOrganizationAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-6 shadow-sm sm:p-8">
      <input type="hidden" name="queryString" value={queryString} />

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-tenderos-navy">
          Nom de l&apos;entreprise
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="organization"
          className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm text-tenderos-navy focus:border-tenderos-blue focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="legalName" className="text-sm font-medium text-tenderos-navy">
          Raison sociale <span className="font-normal text-tenderos-slate">(optionnel)</span>
        </label>
        <input
          id="legalName"
          name="legalName"
          type="text"
          className="rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm text-tenderos-navy focus:border-tenderos-blue focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="registrationNumber" className="text-sm font-medium text-tenderos-navy">
          SIRET <span className="font-normal text-tenderos-slate">(optionnel)</span>
        </label>
        <input
          id="registrationNumber"
          name="registrationNumber"
          type="text"
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
        className="rounded-lg bg-tenderos-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90 disabled:opacity-50"
      >
        {isPending ? "Création..." : "Continuer"}
      </button>
    </form>
  );
}
