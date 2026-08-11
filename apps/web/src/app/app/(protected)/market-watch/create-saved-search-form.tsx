"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSavedSearchAction } from "../../market-watch-actions";

/** Mission §95/§96/§97/§98 — mode simple par défaut (mot-clé + zone + budget), section avancée
 *  repliée (CPV, exclusions, deadline, source...) : jamais un formulaire à 40 champs obligatoire. */
export function CreateSavedSearchForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [department, setDepartment] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [excludeKeyword, setExcludeKeyword] = useState("");
  const [cpvCode, setCpvCode] = useState("");
  const [deadlineAfterDays, setDeadlineAfterDays] = useState("");
  const [alertInApp, setAlertInApp] = useState(true);
  const [alertEmail, setAlertEmail] = useState(false);
  const [emailFrequency, setEmailFrequency] = useState<"IMMEDIATE" | "DAILY_DIGEST">("DAILY_DIGEST");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCreate() {
    if (!name.trim()) {
      setError("Donnez un nom à cette veille.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await createSavedSearchAction({
      name: name.trim(),
      criteria: {
        includeKeywords: keyword.trim() ? [keyword.trim()] : [],
        excludeKeywords: excludeKeyword.trim() ? [excludeKeyword.trim()] : [],
        departments: department.trim() ? [department.trim()] : [],
        cpvCodes: cpvCode.trim() ? [cpvCode.trim()] : [],
        minAmount: minAmount ? Number(minAmount) : undefined,
        deadlineAfterDays: deadlineAfterDays ? Number(deadlineAfterDays) : undefined,
        includeUnknownAmount: true,
      },
      alertInApp,
      alertEmail,
      emailFrequency,
    });
    setIsPending(false);
    if (result.error || !result.savedSearch) {
      setError(result.error ?? "Erreur inattendue.");
      return;
    }
    router.push(`/app/market-watch?searchId=${result.savedSearch.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="ss-name" className="text-sm font-medium text-neutral-700">
          Nom de la veille
        </label>
        <input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Nettoyage Île-de-France" className="mt-1 w-full max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="ss-keyword" className="text-sm font-medium text-neutral-700">
          Je recherche
        </label>
        <input id="ss-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="ex. Nettoyage industriel" className="mt-1 w-full max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="ss-department" className="text-sm font-medium text-neutral-700">
          Où (département)
        </label>
        <input id="ss-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="ex. 75" className="mt-1 w-full max-w-xs rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="ss-min-amount" className="text-sm font-medium text-neutral-700">
          Budget minimum (€)
        </label>
        <input id="ss-min-amount" type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="ex. 100000" className="mt-1 w-full max-w-xs rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="self-start text-xs font-medium text-neutral-600 hover:underline">
        {showAdvanced ? "Masquer les filtres avancés" : "Filtres avancés"}
      </button>

      {showAdvanced ? (
        <div className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
          <div>
            <label htmlFor="ss-exclude" className="text-sm font-medium text-neutral-700">
              Mots-clés exclus
            </label>
            <input id="ss-exclude" value={excludeKeyword} onChange={(e) => setExcludeKeyword(e.target.value)} className="mt-1 w-full max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="ss-cpv" className="text-sm font-medium text-neutral-700">
              Code CPV
            </label>
            <input id="ss-cpv" value={cpvCode} onChange={(e) => setCpvCode(e.target.value)} placeholder="ex. 90910000" className="mt-1 w-full max-w-xs rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="ss-deadline" className="text-sm font-medium text-neutral-700">
              Deadline dans au moins (jours)
            </label>
            <input id="ss-deadline" type="number" min={0} value={deadlineAfterDays} onChange={(e) => setDeadlineAfterDays(e.target.value)} placeholder="ex. 14" className="mt-1 w-full max-w-xs rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
        <span className="text-sm font-medium text-neutral-700">Alertes</span>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={alertInApp} onChange={(e) => setAlertInApp(e.target.checked)} />
          Notification TenderOS
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={alertEmail} onChange={(e) => setAlertEmail(e.target.checked)} />
          Email
        </label>
        {alertEmail ? (
          <div className="ml-6 flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="radio" name="freq" checked={emailFrequency === "DAILY_DIGEST"} onChange={() => setEmailFrequency("DAILY_DIGEST")} />
              Résumé quotidien
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="radio" name="freq" checked={emailFrequency === "IMMEDIATE"} onChange={() => setEmailFrequency("IMMEDIATE")} />
              Immédiatement
            </label>
          </div>
        ) : null}
      </div>

      <button type="button" disabled={isPending} onClick={handleCreate} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer la veille"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
