"use client";

import { useActionState } from "react";
import { completeOnboardingConfigurationAction, type ConfigurationStepState } from "../onboarding-actions";
import { SECTORS } from "../../../lib/sectors";

const INITIAL_STATE: ConfigurationStepState = {};

const MARKET_PREFERENCES = [
  { value: "PUBLIC", label: "Marchés publics" },
  { value: "PRIVATE", label: "Marchés privés" },
  { value: "BOTH", label: "Les deux" },
] as const;

export function ConfigurationForm() {
  const [state, formAction, isPending] = useActionState(completeOnboardingConfigurationAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1">
        <label htmlFor="sector" className="text-sm font-medium text-tenderos-navy">
          Secteur d&apos;activité
        </label>
        <select
          id="sector"
          name="sector"
          className="rounded-lg border border-tenderos-navy/15 bg-white px-3 py-2 text-sm text-tenderos-navy focus:border-tenderos-blue focus:outline-none"
        >
          <option value="">Ne pas préciser</option>
          {SECTORS.map((sector) => (
            <option key={sector} value={sector}>
              {sector}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-tenderos-navy">Type de marchés visés</legend>
        {MARKET_PREFERENCES.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-tenderos-navy">
            <input type="radio" name="marketPreference" value={option.value} className="h-4 w-4 border-tenderos-navy/30 text-tenderos-blue focus:ring-tenderos-blue" />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-tenderos-navy">Région</span>
        <p className="text-sm text-tenderos-slate">France</p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-warning-fg">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-tenderos-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90 disabled:opacity-50"
        >
          {isPending ? "Enregistrement..." : "Continuer"}
        </button>
        <button
          type="submit"
          name="skip"
          value="true"
          disabled={isPending}
          className="rounded-lg border border-tenderos-navy/15 px-4 py-2.5 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light disabled:opacity-50"
        >
          Passer cette étape
        </button>
      </div>
    </form>
  );
}
