"use client";

import { useActionState, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Input } from "../../../../../components/ui/input";
import {
  attachExistingDocumentToTenderAction,
  detachDocumentFromTenderAction,
  searchLibraryDocumentsAction,
  uploadAndAttachDocumentToTenderAction,
  type FormActionState,
} from "../../../documents-actions";
import { formatFileSize, type DocumentSummary } from "../../../../../lib/documents-types";
import { FileInput } from "../../../../../components/ui/file-input";
import { SearchSelect } from "../../../../../components/ui/search-select";

const INITIAL_STATE: FormActionState = {};

function DetachButton({ tenderId, documentId }: { tenderId: string; documentId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="link"
        loading={isPending}
        className="text-danger-fg"
        onClick={async () => {
          setIsPending(true);
          const result = await detachDocumentFromTenderAction(tenderId, documentId);
          setIsPending(false);
          setError(result.error);
        }}
      >
        Détacher
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Section "Documents" de la fiche Tender — attache par depot direct (creation + association
 *  composees, voir uploadAndAttachDocumentToTenderAction) ou en choisissant un document existant
 *  de la bibliotheque par son titre (`SearchSelect`), jamais en recopiant un identifiant. */
export function DocumentsSection({
  tenderId,
  documents,
  canManage,
}: {
  tenderId: string;
  documents: DocumentSummary[];
  canManage: boolean;
}) {
  const uploadAction = uploadAndAttachDocumentToTenderAction.bind(null, tenderId);
  const [uploadState, uploadFormAction, isUploading] = useActionState(uploadAction, INITIAL_STATE);

  const attachAction = attachExistingDocumentToTenderAction.bind(null, tenderId);
  const [attachState, attachFormAction, isAttaching] = useActionState(attachAction, INITIAL_STATE);

  return (
    <Card title="Documents">
      <div className="flex flex-col gap-2">
        {documents.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun document rattaché.</p>
        ) : (
          <ul>
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-2 border-b border-tenderos-navy/10 py-2 text-sm"
              >
                <div className="min-w-0">
                  <a
                    href={`/app/documents/${doc.id}`}
                    className="font-medium text-tenderos-navy hover:underline"
                  >
                    {doc.title}
                  </a>
                  {doc.currentVersion ? (
                    <span className="ml-2 text-xs text-tenderos-slate">
                      {formatFileSize(doc.currentVersion.sizeBytes)}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <a
                    href={`/app/documents/${doc.id}/download`}
                    className="text-xs text-tenderos-blue underline-offset-2 hover:underline"
                  >
                    Télécharger
                  </a>
                  {canManage ? <DetachButton tenderId={tenderId} documentId={doc.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <>
            {/* Checkpoint TENDEROS-2.1-H.3 — ces deux formulaires debordaient de 307 px a 1024 px.
                Mesure : `input[name=file]` [1022..1242] et le bouton [1250..1331], hors d'un viewport
                de 1024. Cause : une ligne `flex` sans `flex-wrap` ni `min-w-0`, placee dans une
                colonne de `md:grid-cols-2` qui ne fait plus qu'environ 350 px des 1024 px — la barre
                laterale devenant statique a ce point de bascule. Un champ de type `file` a une largeur
                intrinseque importante : sans autorisation de retrecir NI de passer a la ligne, la
                ligne imposait sa largeur au document entier.
                `flex-wrap` laisse les controles s'empiler quand la colonne est etroite ; une largeur
                minimale autorise les champs texte a retrecir. Aucun masquage d'overflow : le contenu
                reste accessible, il se reorganise.

                H.3-b — la borne etait `min-w-0`, sans plancher : les champs descendaient a ~45 px,
                largeur ou ils ne debordent plus mais ne servent plus a rien. Le defaut changeait de
                nature au lieu de disparaitre. Un plancher explicite les fait passer A LA LIGNE au lieu
                de s'ecraser, ce que `flex-wrap` etait justement la pour permettre. */}
            <form action={uploadFormAction} className="flex flex-wrap items-end gap-2">
              <Input
                name="title"
                type="text"
                required
                placeholder="Titre du document..."
                className="min-w-[10rem] flex-1"
              />
              <Input
                name="category"
                type="text"
                placeholder="Catégorie"
                className="min-w-[8rem] flex-1"
              />
              {/* W4 — le fichier et son bouton passent à la ligne ENSEMBLE. Mesuré à 1024 et 1512 px :
                  le bouton glissait seul sur une ligne, loin du champ qu'il valide. Le plancher
                  (18rem) laisse au champ la place de son bouton « Choisir un fichier ». */}
              <div className="flex min-w-[18rem] flex-1 items-end gap-2">
                <FileInput name="file" required aria-label="Fichier à déposer" className="min-w-0 flex-1" />
                <Button type="submit" size="sm" loading={isUploading} className="shrink-0">
                  Déposer et rattacher
                </Button>
              </div>
              {uploadState.error ? (
                <p role="alert" className="text-xs text-danger-fg">
                  {uploadState.error}
                </p>
              ) : null}
            </form>

            <form action={attachFormAction} className="flex flex-wrap items-end gap-2">
              {/* W4 — même motif : recherche et bouton sur une ligne commune (mesuré à 1024 px, le
                  plancher de 14rem renvoyait « Rattacher » seul à la ligne). */}
              <div className="flex min-w-0 flex-1 basis-full items-end gap-2">
                <SearchSelect
                  name="documentId"
                  ariaLabel="Document de la bibliothèque"
                  placeholder="Rechercher un document de la bibliothèque…"
                  search={searchLibraryDocumentsAction}
                  className="min-w-[10rem] flex-1"
                />
                <Button type="submit" size="sm" loading={isAttaching} className="shrink-0">
                  Rattacher
                </Button>
              </div>
              {attachState.error ? (
                <p role="alert" className="text-xs text-danger-fg">
                  {attachState.error}
                </p>
              ) : null}
            </form>
          </>
        ) : null}
      </div>
    </Card>
  );
}
