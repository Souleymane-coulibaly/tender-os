"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Select } from "../../../../../components/ui";
import {
  browseRemoteFolder,
  createCalendarEventAction,
  disconnectConnectionAction,
  exportDocumentVersionAction,
  importRemoteFileAction,
  initiateConnectionAction,
  reauthorizeConnectionAction,
  testConnectionAction,
  type DocumentPickerOption,
  type TenderPickerOption,
} from "../../../connectors-actions";
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_TONE,
  CONNECTOR_PROVIDER_FEATURES,
  CONNECTOR_PROVIDER_LABELS,
  type BrowseResult,
  type ConnectorProvider,
  type ExternalConnectionSummary,
} from "../../../../../lib/connectors-types";
import { EntitlementUpgradeNotice } from "../../entitlement-upgrade-notice";

/** Encadré d'un sous-formulaire du panneau Parcourir (import/export/calendrier) — un simple fond
 *  clair dans la carte du fournisseur plutôt qu'une `Card` imbriquée dans une `Card`. */
const SUB_FORM_CLASSES = "flex flex-wrap items-end gap-2 rounded-lg border border-tenderos-navy/10 bg-tenderos-light p-2";

function BrowsePanel({ connectionId, tenders, documents }: { connectionId: string; tenders: TenderPickerOption[]; documents: DocumentPickerOption[] }) {
  const [containerId, setContainerId] = useState<string | undefined>();
  const [folderId, setFolderId] = useState<string | undefined>();
  const [folderStack, setFolderStack] = useState<string[]>([]);
  const [result, setResult] = useState<BrowseResult | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string; mimeType: string } | undefined>();
  const [importTenderId, setImportTenderId] = useState("");
  const [message, setMessage] = useState<string | undefined>();

  const [exportDocumentId, setExportDocumentId] = useState("");
  const [exportTenderId, setExportTenderId] = useState("");
  const [calendarTenderId, setCalendarTenderId] = useState("");

  async function load(nextContainerId: string | undefined, nextFolderId: string | undefined) {
    setLoading(true);
    setError(undefined);
    try {
      const browsed = await browseRemoteFolder(connectionId, nextContainerId, nextFolderId);
      setResult(browsed);
      setContainerId(nextContainerId);
      setFolderId(nextFolderId);
    } catch {
      setError("Impossible de charger ce dossier distant.");
    } finally {
      setLoading(false);
    }
  }

  function openFolder(id: string) {
    if (folderId) setFolderStack((s) => [...s, folderId]);
    void load(containerId, id);
  }

  function goUp() {
    const next = [...folderStack];
    const previous = next.pop();
    setFolderStack(next);
    void load(containerId, previous);
  }

  const selectedDocument = documents.find((d) => d.id === exportDocumentId);

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-tenderos-navy/10 pt-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">Parcourir</h3>
        {!containerId ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => load(undefined, undefined)} disabled={loading} className="mt-1">
            {loading ? "Chargement..." : "Afficher les emplacements disponibles"}
          </Button>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tenderos-slate">
            <Button type="button" variant="link" onClick={() => load(undefined, undefined)}>
              Emplacements
            </Button>
            {folderId ? (
              <Button type="button" variant="secondary" size="sm" onClick={goUp}>
                Remonter
              </Button>
            ) : null}
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger-fg">
            {error}
          </p>
        ) : null}

        {result?.containers ? (
          <ul className="mt-2 flex flex-col gap-1">
            {result.containers.map((c) => (
              <li key={c.id}>
                <Button type="button" variant="link" onClick={() => load(c.id, undefined)} className="text-xs">
                  📁 {c.name}
                </Button>
              </li>
            ))}
            {result.containers.length === 0 ? <li className="text-xs text-tenderos-slate">Aucun emplacement accessible.</li> : null}
          </ul>
        ) : null}

        {result?.listing ? (
          <ul className="mt-2 flex flex-col gap-1">
            {result.listing.folders.map((f) => (
              <li key={f.id}>
                <Button type="button" variant="link" onClick={() => openFolder(f.id)} className="text-xs">
                  📁 {f.name}
                </Button>
              </li>
            ))}
            {result.listing.files.map((f) => (
              <li key={f.id} className={`flex items-center gap-2 text-xs ${selectedFile?.id === f.id ? "font-semibold text-tenderos-navy" : "text-tenderos-navy"}`}>
                {/* Laissé en <button> natif volontairement : `Button` impose `font-semibold`, ce qui
                    effacerait la distinction fichier sélectionné (gras) / non sélectionné. */}
                <button type="button" onClick={() => setSelectedFile({ id: f.id, name: f.name, mimeType: f.mimeType })} className="text-left hover:underline">
                  📄 {f.name}
                </button>
                {selectedFile?.id === f.id ? <Badge tone="info">Sélectionné</Badge> : null}
              </li>
            ))}
            {result.listing.folders.length === 0 && result.listing.files.length === 0 ? <li className="text-xs text-tenderos-slate">Dossier vide.</li> : null}
          </ul>
        ) : null}
      </div>

      {selectedFile ? (
        <form
          className={SUB_FORM_CLASSES}
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage(undefined);
            const tender = tenders.find((t) => t.id === importTenderId);
            const result = await importRemoteFileAction(connectionId, {
              containerId: containerId!,
              fileId: selectedFile.id,
              mimeType: selectedFile.mimeType,
              tenderId: importTenderId || undefined,
              clientAccountId: tender?.clientAccountId,
            });
            setMessage(result.error ?? `Importé — document TenderOS ${result.documentId}`);
          }}
        >
          <span className="text-xs text-tenderos-navy">Importer « {selectedFile.name} » vers :</span>
          {/* `Select` sans `label` rend le contrôle nu (w-full) : la largeur est portée par le conteneur. */}
          <div className="min-w-[12rem] flex-1">
            <Select value={importTenderId} onChange={(e) => setImportTenderId(e.target.value)}>
              <option value="">Bibliothèque organisation (sans Tender)</option>
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Importer
          </Button>
        </form>
      ) : null}

      {containerId && result?.listing ? (
        <form
          className={SUB_FORM_CLASSES}
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage(undefined);
            if (!selectedDocument) return;
            const tender = tenders.find((t) => t.id === exportTenderId);
            const result = await exportDocumentVersionAction(connectionId, {
              containerId,
              folderId: folderId ?? containerId,
              documentId: selectedDocument.id,
              versionId: selectedDocument.currentVersion.id,
              clientAccountId: tender?.clientAccountId,
            });
            setMessage(result.error ?? `Exporté vers le dossier distant — ${result.remoteFileId}`);
          }}
        >
          <span className="text-xs text-tenderos-navy">Exporter un document TenderOS ici :</span>
          <div className="min-w-[12rem] flex-1">
            <Select value={exportDocumentId} onChange={(e) => setExportDocumentId(e.target.value)}>
              <option value="">Choisir un document...</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} (v{d.currentVersion.versionNumber})
                </option>
              ))}
            </Select>
          </div>
          {/* La connexion peut être restreinte à certains clients (mission §49/§52) : le Tender
              choisi ici fournit le `clientAccountId` vérifié côté backend contre cette restriction —
              jamais deviné, jamais optionnel dès qu'une connexion est narrowed. */}
          <div className="min-w-[12rem] flex-1">
            <Select value={exportTenderId} onChange={(e) => setExportTenderId(e.target.value)}>
              <option value="">Client/Tender concerné (optionnel)...</option>
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary" size="sm" disabled={!selectedDocument}>
            Exporter la version courante
          </Button>
        </form>
      ) : null}

      <form
        className={SUB_FORM_CLASSES}
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage(undefined);
          if (!calendarTenderId) return;
          const result = await createCalendarEventAction(connectionId, calendarTenderId);
          setMessage(result.error ?? (result.alreadyExisted ? "Événement déjà existant (aucun doublon créé)." : "Événement calendrier créé."));
        }}
      >
        <span className="text-xs text-tenderos-navy">Créer un événement calendrier pour l&apos;échéance de :</span>
        <div className="min-w-[12rem] flex-1">
          <Select value={calendarTenderId} onChange={(e) => setCalendarTenderId(e.target.value)}>
            <option value="">Choisir un Tender...</option>
            {tenders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={!calendarTenderId}>
          Créer l&apos;événement
        </Button>
      </form>

      {message ? <p className="text-xs text-tenderos-navy">{message}</p> : null}
    </div>
  );
}

export function ConnectorProviderCard({
  provider,
  connection,
  canManage,
  canUse,
  hasEntitlement,
  tenders,
  documents,
}: {
  provider: ConnectorProvider;
  connection: ExternalConnectionSummary | undefined;
  canManage: boolean;
  canUse: boolean;
  /** Checkpoint TENDEROS-2.1-P2.3-E1 — `EntitlementFeature.AutomationConnectors` (backend gate
   *  réel, `InitiateOAuthConnectionUseCase`) : jamais dupliqué ici, uniquement affiché. */
  hasEntitlement: boolean;
  tenders: TenderPickerOption[];
  documents: DocumentPickerOption[];
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [testMessage, setTestMessage] = useState<string | undefined>();

  async function handleConnect(reauthorize: boolean) {
    setIsPending(true);
    setError(undefined);
    const result = reauthorize && connection ? await reauthorizeConnectionAction(connection.id) : await initiateConnectionAction(provider, `${CONNECTOR_PROVIDER_LABELS[provider]} — organisation`);
    setIsPending(false);
    if (result.error || !result.authorizationUrl) {
      setError(result.error ?? "Impossible de démarrer la connexion.");
      // L'état serveur a pu changer malgré l'échec (connexion en cours laissée par un essai
      // précédent) : la carte le relit plutôt que de proposer encore « Connecter » à l'aveugle.
      router.refresh();
      return;
    }
    window.location.href = result.authorizationUrl;
  }

  async function handleDisconnect() {
    if (!connection) return;
    if (!window.confirm(`Déconnecter ${CONNECTOR_PROVIDER_LABELS[provider]} ? Les imports/exports en cours via cette connexion ne seront plus possibles.`)) return;
    setIsPending(true);
    const result = await disconnectConnectionAction(connection.id);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleTestConnection() {
    if (!connection) return;
    setIsPending(true);
    setTestMessage(undefined);
    const result = await testConnectionAction(connection.id);
    setIsPending(false);
    if (result.error) {
      setTestMessage(result.error);
      return;
    }
    const status = result.connection?.status;
    setTestMessage(status === "ACTIVE" ? "Connexion opérationnelle." : `Résultat : ${status ? CONNECTION_STATUS_LABELS[status] : "inconnu"}.`);
    router.refresh();
  }

  return (
    <Card
      padding="tight"
      title={CONNECTOR_PROVIDER_LABELS[provider]}
      description={CONNECTOR_PROVIDER_FEATURES[provider]}
      actions={connection ? <Badge tone={CONNECTION_STATUS_TONE[connection.status]}>{CONNECTION_STATUS_LABELS[connection.status]}</Badge> : undefined}
    >
      <div className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {error}
          </p>
        ) : null}

        {!connection ? (
          canManage ? (
            hasEntitlement ? (
              <Button type="button" variant="secondary" disabled={isPending} onClick={() => handleConnect(false)} className="self-start">
                Connecter
              </Button>
            ) : (
              <EntitlementUpgradeNotice featureLabel="Les connecteurs (Microsoft 365 / Google Workspace)" />
            )
          ) : (
            <p className="text-xs text-tenderos-slate">Réservé Propriétaire/Administrateur.</p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-tenderos-slate">
              <dt className="text-tenderos-slate/70">Compte</dt>
              <dd>{connection.externalAccountLabel ?? "—"}</dd>
              <dt className="text-tenderos-slate/70">Connecté par</dt>
              <dd>{connection.connectedBy}</dd>
              <dt className="text-tenderos-slate/70">Dernière synchro</dt>
              <dd>{connection.lastSuccessfulSyncAt ? new Date(connection.lastSuccessfulSyncAt).toLocaleString("fr-FR") : "Jamais"}</dd>
              {connection.lastError ? (
                <>
                  <dt className="text-tenderos-slate/70">Dernière erreur</dt>
                  <dd className="text-danger-fg">{connection.lastError}</dd>
                </>
              ) : null}
            </dl>

            {canManage || canUse ? (
              <div className="flex flex-wrap items-center gap-2">
                {connection.status === "REAUTH_REQUIRED" && canManage ? (
                  <Button type="button" variant="primary" size="sm" disabled={isPending} onClick={() => handleConnect(true)}>
                    Reconnecter
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={handleTestConnection}>
                  Tester la connexion
                </Button>
                {canManage ? (
                  <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={handleDisconnect}>
                    Déconnecter
                  </Button>
                ) : null}
                {testMessage ? <span className="text-xs text-tenderos-slate">{testMessage}</span> : null}
              </div>
            ) : null}

            {connection.status === "ACTIVE" && canUse ? <BrowsePanel connectionId={connection.id} tenders={tenders} documents={documents} /> : null}
          </div>
        )}
      </div>
    </Card>
  );
}
