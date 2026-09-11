"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveSubcontractorCertificationAction, createSubcontractorCertificationAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorCertification } from "../../../../../lib/subcontractor-types";
import { Button, Card, FieldWrapper, Input } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function SubcontractorCertificationsSection({ subcontractorId, certifications }: { subcontractorId: string; certifications: SubcontractorCertification[] }) {
  const router = useRouter();
  const boundAction = createSubcontractorCertificationAction.bind(null, subcontractorId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [archivingId, setArchivingId] = useState<string | undefined>();

  async function handleArchive(certificationId: string) {
    setArchivingId(certificationId);
    const result = await archiveSubcontractorCertificationAction(subcontractorId, certificationId);
    setArchivingId(undefined);
    if (!result.error) router.refresh();
  }

  const active = certifications.filter((certification) => certification.status !== "ARCHIVED");

  return (
    <Card title="Certifications">
      <div className="flex flex-col gap-4">
        {active.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune certification enregistrée.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {active.map((certification) => (
              <li key={certification.id} className="flex items-center justify-between gap-3 rounded-lg border border-tenderos-navy/10 px-3 py-2">
                <span>
                  <span className="font-medium text-tenderos-navy">{certification.name}</span>
                  {certification.issuer ? <span className="text-tenderos-slate"> — {certification.issuer}</span> : null}
                  {certification.expiresAt ? <span className="text-tenderos-slate"> (jusqu&apos;au {new Date(certification.expiresAt).toLocaleDateString("fr-FR")})</span> : null}
                </span>
                <Button type="button" variant="danger" size="sm" onClick={() => handleArchive(certification.id)} disabled={archivingId === certification.id} className="shrink-0">
                  Archiver
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <FieldWrapper label="Nom *" className="basis-48">
            <Input id="name" name="name" required />
          </FieldWrapper>
          <Input label="Organisme" id="issuer" name="issuer" wrapperClassName="basis-48" />
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
