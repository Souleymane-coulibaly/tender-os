"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input } from "../../../../components/ui";
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
      <Input
        label="Nom de la veille"
        id="ss-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ex. Nettoyage Île-de-France"
        wrapperClassName="max-w-md"
      />

      <Input
        label="Je recherche"
        id="ss-keyword"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="ex. Nettoyage industriel"
        wrapperClassName="max-w-md"
      />

      <Input
        label="Où (département)"
        id="ss-department"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        placeholder="ex. 75"
        wrapperClassName="max-w-xs"
      />

      <Input
        label="Budget minimum (€)"
        id="ss-min-amount"
        type="number"
        min={0}
        value={minAmount}
        onChange={(e) => setMinAmount(e.target.value)}
        placeholder="ex. 100000"
        wrapperClassName="max-w-xs"
      />

      <Button variant="link" onClick={() => setShowAdvanced((v) => !v)} className="self-start text-xs">
        {showAdvanced ? "Masquer les filtres avancés" : "Filtres avancés"}
      </Button>

      {showAdvanced ? (
        <div className="flex flex-col gap-3 rounded-lg border border-tenderos-navy/10 p-3">
          <Input
            label="Mots-clés exclus"
            id="ss-exclude"
            value={excludeKeyword}
            onChange={(e) => setExcludeKeyword(e.target.value)}
            wrapperClassName="max-w-md"
          />
          <Input
            label="Code CPV"
            id="ss-cpv"
            value={cpvCode}
            onChange={(e) => setCpvCode(e.target.value)}
            placeholder="ex. 90910000"
            wrapperClassName="max-w-xs"
          />
          <Input
            label="Deadline dans au moins (jours)"
            id="ss-deadline"
            type="number"
            min={0}
            value={deadlineAfterDays}
            onChange={(e) => setDeadlineAfterDays(e.target.value)}
            placeholder="ex. 14"
            wrapperClassName="max-w-xs"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-tenderos-navy/10 p-3">
        <h3 className="text-sm font-semibold text-tenderos-navy">Alertes</h3>
        <Checkbox label="Notification TenderOS" checked={alertInApp} onChange={(e) => setAlertInApp(e.target.checked)} />
        <Checkbox label="Email" checked={alertEmail} onChange={(e) => setAlertEmail(e.target.checked)} />
        {alertEmail ? (
          <div className="ml-6 flex flex-col gap-1">
            {/* Pas de composant Radio dans le design system : bouton radio natif, libellé aux jetons. */}
            <label className="flex items-center gap-2 text-xs text-tenderos-slate">
              <input type="radio" name="freq" checked={emailFrequency === "DAILY_DIGEST"} onChange={() => setEmailFrequency("DAILY_DIGEST")} />
              Résumé quotidien
            </label>
            <label className="flex items-center gap-2 text-xs text-tenderos-slate">
              <input type="radio" name="freq" checked={emailFrequency === "IMMEDIATE"} onChange={() => setEmailFrequency("IMMEDIATE")} />
              Immédiatement
            </label>
          </div>
        ) : null}
      </div>

      <Button type="button" variant="primary" disabled={isPending} onClick={handleCreate} className="self-start">
        {isPending ? "Création..." : "Créer la veille"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
