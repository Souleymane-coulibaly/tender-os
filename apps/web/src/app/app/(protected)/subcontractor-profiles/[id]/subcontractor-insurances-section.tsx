"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveSubcontractorInsuranceAction,
  createSubcontractorInsuranceAction,
  type FormActionState,
} from "../../../subcontractor-actions";
import type { SubcontractorInsurance } from "../../../../../lib/subcontractor-types";
import { INSURANCE_TYPE_LABELS } from "../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

export function SubcontractorInsurancesSection({
  subcontractorId,
  insurances,
}: {
  subcontractorId: string;
  insurances: SubcontractorInsurance[];
}) {
  const router = useRouter();
  const boundAction = createSubcontractorInsuranceAction.bind(null, subcontractorId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [archivingId, setArchivingId] = useState<string | undefined>();

  async function handleArchive(insuranceId: string) {
    setArchivingId(insuranceId);
    const result = await archiveSubcontractorInsuranceAction(subcontractorId, insuranceId);
    setArchivingId(undefined);
    if (!result.error) router.refresh();
  }

  const active = insurances.filter((insurance) => insurance.status !== "ARCHIVED");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-neutral-900">Assurances</h2>
      {active.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune assurance enregistrée.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {active.map((insurance) => (
            <li
              key={insurance.id}
              className="flex items-center justify-between rounded border border-neutral-100 px-3 py-2"
            >
              <span>
                <span className="font-medium text-neutral-900">
                  {(INSURANCE_TYPE_LABELS as Record<string, string>)[insurance.type] ??
                    insurance.type}
                </span>
                {insurance.insurer ? (
                  <span className="text-neutral-600"> — {insurance.insurer}</span>
                ) : null}
                {insurance.expiresAt ? (
                  <span className="text-neutral-500">
                    {" "}
                    (jusqu&apos;au {new Date(insurance.expiresAt).toLocaleDateString("fr-FR")})
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => handleArchive(insurance.id)}
                disabled={archivingId === insurance.id}
                className="text-red-700 hover:underline disabled:opacity-50"
              >
                Archiver
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="type" className="text-xs text-neutral-600">
            Type *
          </label>
          <input
            id="type"
            name="type"
            required
            placeholder="ex. RC pro"
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="insurer" className="text-xs text-neutral-600">
            Assureur
          </label>
          <input
            id="insurer"
            name="insurer"
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="expiresAt" className="text-xs text-neutral-600">
            Échéance
          </label>
          <input
            id="expiresAt"
            name="expiresAt"
            type="date"
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
        {state.error ? (
          <p role="alert" className="w-full text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
