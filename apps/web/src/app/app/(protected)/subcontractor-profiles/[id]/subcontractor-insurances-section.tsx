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
import { Button, Card, FieldWrapper, Input } from "../../../../../components/ui";

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
    <Card title="Assurances">
      <div className="flex flex-col gap-4">
        {active.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune assurance enregistrée.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {active.map((insurance) => (
              <li
                key={insurance.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-tenderos-navy/10 px-3 py-2"
              >
                <span>
                  <span className="font-medium text-tenderos-navy">
                    {(INSURANCE_TYPE_LABELS as Record<string, string>)[insurance.type] ??
                      insurance.type}
                  </span>
                  {insurance.insurer ? (
                    <span className="text-tenderos-slate"> — {insurance.insurer}</span>
                  ) : null}
                  {insurance.expiresAt ? (
                    <span className="text-tenderos-slate">
                      {" "}
                      (jusqu&apos;au {new Date(insurance.expiresAt).toLocaleDateString("fr-FR")})
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => handleArchive(insurance.id)}
                  disabled={archivingId === insurance.id}
                  className="shrink-0"
                >
                  Archiver
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <FieldWrapper label="Type *" className="basis-48">
            <Input id="type" name="type" required placeholder="ex. RC pro" />
          </FieldWrapper>
          <Input label="Assureur" id="insurer" name="insurer" wrapperClassName="basis-48" />
          <Input label="Échéance" id="expiresAt" name="expiresAt" type="date" wrapperClassName="basis-40" />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Ajout..." : "Ajouter"}
          </Button>
          {state.error ? (
            <p role="alert" className="w-full text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
