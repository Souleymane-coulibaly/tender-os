"use client";

import { useActionState } from "react";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Checkbox } from "../../../../../components/ui/checkbox";
import { Input } from "../../../../../components/ui/input";
import { createRequestedDocumentAction, type FormActionState } from "../../../actions";
import type { RequestedDocument, RequestedDocumentStatus } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

/**
 * Design System — remplace l'ancien `statusBadgeClass()` local, valeurs visuelles identiques. La
 * table est EXHAUSTIVE sur l'union plutot que refermee par un `default:` : un futur statut ne
 * passera plus silencieusement en gris, il fera echouer la compilation.
 */
const STATUS_TONE: Record<RequestedDocumentStatus, BadgeTone> = {
  VALIDATED: "success",
  REJECTED: "danger",
  PROVIDED: "info",
  PENDING: "neutral",
};

export function RequestedDocumentsSection({
  tenderId,
  documents,
}: {
  tenderId: string;
  documents: RequestedDocument[];
}) {
  const boundAction = createRequestedDocumentAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Pieces demandees">
      <div className="flex flex-col gap-2">
        {documents.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune piece demandee.</p>
        ) : (
          <ul>
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center gap-2 border-b border-tenderos-navy/10 py-2 text-sm"
              >
                <span className="font-medium text-tenderos-navy">{document.name}</span>
                {document.required ? (
                  <span className="text-xs text-warning-fg">obligatoire</span>
                ) : null}
                <Badge tone={STATUS_TONE[document.status]}>{document.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        {/* H.3-b — cette ligne debordait de sa colonne, pas du document : deux `input` sans plancher
            ni autorisation de retrecir (270 + 270 px), plus la case a cocher et le bouton, dans une
            piste `md:grid-cols-2` en `minmax(0, 1fr)` dont la largeur est plafonnee. Le trop-plein
            se deversait DANS la colonne voisine, recouvrant « Ajouter » — invisible pour un controle
            de `document.scrollWidth`, qui ne voyait aucune largeur totale supplementaire. Mesure :
            +8 px a 1512, +48 px a 1280, +176 px a 1024. */}
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <Input
            name="name"
            type="text"
            required
            placeholder="Nom de la piece..."
            className="min-w-[10rem] flex-1"
          />
          <Input
            name="category"
            type="text"
            placeholder="Categorie"
            className="min-w-[8rem] flex-1"
          />
          <Checkbox name="required" label="obligatoire" className="h-9 shrink-0 text-xs" />
          <Button type="submit" size="sm" loading={isPending}>
            Ajouter
          </Button>
          {state.error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
