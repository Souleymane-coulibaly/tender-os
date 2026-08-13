"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
  CONNECTOR_PROVIDER_FEATURES,
  CONNECTOR_PROVIDER_LABELS,
  connectionStatusBadgeClass,
  type BrowseResult,
  type ConnectorProvider,
  type ExternalConnectionSummary,
} from "../../../../../lib/connectors-types";

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
    <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Parcourir</h3>
        {!containerId ? (
          <button type="button" onClick={() => load(undefined, undefined)} disabled={loading} className="mt-1 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50">
            {loading ? "Chargement..." : "Afficher les emplacements disponibles"}
          </button>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
            <button type="button" onClick={() => load(undefined, undefined)} className="underline hover:no-underline">
              Emplacements
            </button>
            {folderId ? (
              <button type="button" onClick={goUp} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">
                Remonter
              </button>
            ) : null}
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        ) : null}

        {result?.containers ? (
          <ul className="mt-2 flex flex-col gap-1">
            {result.containers.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => load(c.id, undefined)} className="text-xs text-blue-700 underline hover:no-underline">
                  📁 {c.name}
                </button>
              </li>
            ))}
            {result.containers.length === 0 ? <li className="text-xs text-neutral-500">Aucun emplacement accessible.</li> : null}
          </ul>
        ) : null}

        {result?.listing ? (
          <ul className="mt-2 flex flex-col gap-1">
            {result.listing.folders.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => openFolder(f.id)} className="text-xs text-blue-700 underline hover:no-underline">
                  📁 {f.name}
                </button>
              </li>
            ))}
            {result.listing.files.map((f) => (
              <li key={f.id} className={`flex items-center gap-2 text-xs ${selectedFile?.id === f.id ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
                <button type="button" onClick={() => setSelectedFile({ id: f.id, name: f.name, mimeType: f.mimeType })} className="text-left hover:underline">
                  📄 {f.name}
                </button>
                {selectedFile?.id === f.id ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">Sélectionné</span> : null}
              </li>
            ))}
            {result.listing.folders.length === 0 && result.listing.files.length === 0 ? <li className="text-xs text-neutral-500">Dossier vide.</li> : null}
          </ul>
        ) : null}
      </div>

      {selectedFile ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 p-2"
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
          <span className="text-xs text-neutral-700">Importer « {selectedFile.name} » vers :</span>
          <select value={importTenderId} onChange={(e) => setImportTenderId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
            <option value="">Bibliothèque organisation (sans Tender)</option>
            {tenders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100">
            Importer
          </button>
        </form>
      ) : null}

      {containerId && result?.listing ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 p-2"
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
          <span className="text-xs text-neutral-700">Exporter un document TenderOS ici :</span>
          <select value={exportDocumentId} onChange={(e) => setExportDocumentId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
            <option value="">Choisir un document...</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} (v{d.currentVersion.versionNumber})
              </option>
            ))}
          </select>
          {/* La connexion peut être restreinte à certains clients (mission §49/§52) : le Tender
              choisi ici fournit le `clientAccountId` vérifié côté backend contre cette restriction —
              jamais deviné, jamais optionnel dès qu'une connexion est narrowed. */}
          <select value={exportTenderId} onChange={(e) => setExportTenderId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
            <option value="">Client/Tender concerné (optionnel)...</option>
            {tenders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!selectedDocument} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50">
            Exporter la version courante
          </button>
        </form>
      ) : null}

      <form
        className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 p-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage(undefined);
          if (!calendarTenderId) return;
          const result = await createCalendarEventAction(connectionId, calendarTenderId);
          setMessage(result.error ?? (result.alreadyExisted ? "Événement déjà existant (aucun doublon créé)." : "Événement calendrier créé."));
        }}
      >
        <span className="text-xs text-neutral-700">Créer un événement calendrier pour l&apos;échéance de :</span>
        <select value={calendarTenderId} onChange={(e) => setCalendarTenderId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
          <option value="">Choisir un Tender...</option>
          {tenders.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!calendarTenderId} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50">
          Créer l&apos;événement
        </button>
      </form>

      {message ? <p className="text-xs text-neutral-700">{message}</p> : null}
    </div>
  );
}

export function ConnectorProviderCard({
  provider,
  connection,
  canManage,
  canUse,
  tenders,
  documents,
}: {
  provider: ConnectorProvider;
  connection: ExternalConnectionSummary | undefined;
  canManage: boolean;
  canUse: boolean;
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
    <section className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{CONNECTOR_PROVIDER_LABELS[provider]}</h2>
          <p className="text-xs text-neutral-500">{CONNECTOR_PROVIDER_FEATURES[provider]}</p>
        </div>
        {connection ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${connectionStatusBadgeClass(connection.status)}`}>{CONNECTION_STATUS_LABELS[connection.status]}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {!connection ? (
        canManage ? (
          <button type="button" disabled={isPending} onClick={() => handleConnect(false)} className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50">
            Connecter
          </button>
        ) : (
          <p className="text-xs text-neutral-500">Réservé Propriétaire/Administrateur.</p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-neutral-600">
            <dt className="text-neutral-400">Compte</dt>
            <dd>{connection.externalAccountLabel ?? "—"}</dd>
            <dt className="text-neutral-400">Connecté par</dt>
            <dd>{connection.connectedBy}</dd>
            <dt className="text-neutral-400">Dernière synchro</dt>
            <dd>{connection.lastSuccessfulSyncAt ? new Date(connection.lastSuccessfulSyncAt).toLocaleString("fr-FR") : "Jamais"}</dd>
            {connection.lastError ? (
              <>
                <dt className="text-neutral-400">Dernière erreur</dt>
                <dd className="text-red-700">{connection.lastError}</dd>
              </>
            ) : null}
          </dl>

          {canManage || canUse ? (
            <div className="flex flex-wrap items-center gap-2">
              {connection.status === "REAUTH_REQUIRED" && canManage ? (
                <button type="button" disabled={isPending} onClick={() => handleConnect(true)} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                  Reconnecter
                </button>
              ) : null}
              <button type="button" disabled={isPending} onClick={handleTestConnection} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50">
                Tester la connexion
              </button>
              {canManage ? (
                <button type="button" disabled={isPending} onClick={handleDisconnect} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100 disabled:opacity-50">
                  Déconnecter
                </button>
              ) : null}
              {testMessage ? <span className="text-xs text-neutral-600">{testMessage}</span> : null}
            </div>
          ) : null}

          {connection.status === "ACTIVE" && canUse ? <BrowsePanel connectionId={connection.id} tenders={tenders} documents={documents} /> : null}
        </div>
      )}
    </section>
  );
}
