"use client";

import { useActionState } from "react";
import { Button, Card, Input, Select, Textarea } from "../../../../../../components/ui";
import {
  createRepresentativeAction,
  type FormActionState,
} from "../../../../company-profile-actions";
import {
  REPRESENTATIVE_TYPES,
  REPRESENTATIVE_TYPE_LABELS,
  SATELLITE_STATUS_LABELS,
  type CompanyRepresentative,
} from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

/** Mission §4.3 — aucun signataire ici n'est sélectionné automatiquement pour un Tender : ce sont
 *  des contacts déclarés au niveau entreprise, `SigningPower` (module administratif) reste le seul
 *  pouvoir de signature réel et opposable. */
export function RepresentativesSection({
  clientId,
  representatives,
}: {
  clientId: string;
  representatives: CompanyRepresentative[];
}) {
  const boundAction = createRepresentativeAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Contacts"
        description={
          <>
            Représentants légaux, signataires déclarés et contacts. Le pouvoir de signature réel
            d&apos;un appel d&apos;offres reste géré dans le dossier administratif de ce Tender.
          </>
        }
      >
        {representatives.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun contact enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-tenderos-navy/10 text-left text-xs font-semibold uppercase tracking-wide text-tenderos-slate">
                  <th scope="col" className="py-2 pr-4">Nom</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Fonction</th>
                  <th scope="col" className="py-2 pr-4">Email</th>
                  <th scope="col" className="py-2 pr-4">Statut</th>
                </tr>
              </thead>
              <tbody>
                {representatives.map((representative) => (
                  <tr key={representative.id} className="border-b border-tenderos-navy/10 last:border-0">
                    <td className="py-2 pr-4 font-medium text-tenderos-navy">
                      {representative.firstName} {representative.lastName}
                    </td>
                    <td className="py-2 pr-4 text-tenderos-slate">
                      {REPRESENTATIVE_TYPE_LABELS[representative.type]}
                    </td>
                    <td className="py-2 pr-4 text-tenderos-slate">{representative.jobTitle ?? "—"}</td>
                    <td className="py-2 pr-4 text-tenderos-slate">{representative.email ?? "—"}</td>
                    <td className="py-2 pr-4 text-tenderos-slate">
                      {SATELLITE_STATUS_LABELS[representative.status] ?? representative.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Ajouter un contact">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input id="firstName" name="firstName" label="Prénom" required />
            <Input id="lastName" name="lastName" label="Nom" required />
            <Select id="type" name="type" label="Type" required>
              {REPRESENTATIVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {REPRESENTATIVE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input id="jobTitle" name="jobTitle" label="Fonction" />
            <Input id="email" name="email" type="email" label="Email" />
            <Input id="phone" name="phone" label="Téléphone" />
          </div>
          <Textarea id="signatureScope" name="signatureScope" rows={2} label="Périmètre de signature déclaré (si signataire)" />
          {state.error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={isPending} className="self-start">
            {isPending ? "Ajout..." : "Ajouter"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
