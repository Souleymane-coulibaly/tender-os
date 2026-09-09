"use client";

import { useActionState, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import { Select } from "../../../../../components/ui/select";
import { changeTenderClientAction, type FormActionState } from "../../../actions";
import { canOfferClientChange, type TenderStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

type AccessibleClient = { id: string; name: string };

/**
 * V2 Sprint 3 §4/§16 — changement CONTROLE du CLIENT (ClientAccount) : jamais fusionne avec la
 * modification des informations generales, propose uniquement tant que la reponse n'a pas
 * vraiment commence (DRAFT/IN_ANALYSIS, miroir de Tender.CANDIDATE_CHANGE_ALLOWED_STATUSES), et
 * uniquement vers une entreprise a laquelle l'acteur a lui-meme acces (la liste fournie ici vient
 * deja de /api/v1/clients, qui ne renvoie que les entreprises accessibles a l'acteur courant — le
 * backend revalide de toute facon l'acces sur l'ancien ET le nouveau client).
 *
 * Checkpoint 2.1-A5 — renomme depuis `CandidateSection`/"Entreprise candidate" : ce composant gere
 * le CLIENT (ClientAccount, relation commerciale/portefeuille) du Tender, jamais la
 * CandidateCompany (l'entité juridique qui répond, voir `CandidateCompanySection`). Les deux
 * concepts restent strictement distincts à l'écran (mission A5 §11/§52).
 */
export function ClientSection({
  tenderId,
  status,
  currentClientAccountId,
  currentClientName,
  accessibleClients,
  canChange,
}: {
  tenderId: string;
  status: TenderStatus;
  currentClientAccountId: string;
  currentClientName: string;
  accessibleClients: AccessibleClient[];
  canChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = changeTenderClientAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const otherClients = accessibleClients.filter((client) => client.id !== currentClientAccountId);
  const offerChange = canChange && canOfferClientChange(status) && otherClients.length > 0;

  return (
    <Card title="Client">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm text-tenderos-navy">{currentClientName}</p>

        {offerChange ? (
          open ? (
            <form
              action={formAction}
              className="mt-2 flex w-full min-w-0 flex-col gap-2 rounded-lg border border-amber-200 bg-warning-bg p-3"
            >
              <Select
                name="clientAccountId"
                label="Nouveau client"
                required
                defaultValue=""
                className="truncate"
              >
                <option value="" disabled>
                  Selectionner...
                </option>
                {otherClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              <Input name="reason" type="text" label="Motif (facultatif)" />
              {state.error ? (
                <p role="alert" className="text-xs text-danger-fg">
                  {state.error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" size="sm" loading={isPending}>
                  Confirmer le changement
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="link"
              className="self-start"
              onClick={() => setOpen(true)}
            >
              Changer de client
            </Button>
          )
        ) : (
          <p className="text-xs text-tenderos-slate">
            {canChange
              ? "Le changement de client n'est plus possible une fois la preparation de la reponse commencee."
              : null}
          </p>
        )}
      </div>
    </Card>
  );
}
