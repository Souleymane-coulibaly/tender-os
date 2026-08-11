"use client";

import { useState } from "react";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import { API_KEY_SCOPES, API_KEY_SCOPE_LABELS, type ApiKeyScope } from "../../../../../lib/integrations-types";
import { createApiKeyAction } from "../../../integrations-actions";
import { CopySecretBox } from "../copy-secret-box";

export function CreateApiKeyForm({ clients }: { clients: ClientAccountSummary[] }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [allowedClientAccountIds, setAllowedClientAccountIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ fullKey: string; keyPrefix: string } | undefined>();

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));
  }

  function toggleClient(clientId: string) {
    setAllowedClientAccountIds((current) => (current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId]));
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    if (scopes.length === 0) {
      setError("Sélectionnez au moins un scope.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await createApiKeyAction({ name: name.trim(), scopes, allowedClientAccountIds, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined });
    setIsPending(false);
    if (result.error || !result.fullKey || !result.apiKey) {
      setError(result.error ?? "Erreur inattendue.");
      return;
    }
    setCreated({ fullKey: result.fullKey, keyPrefix: result.apiKey.keyPrefix });
    setName("");
    setScopes([]);
    setAllowedClientAccountIds([]);
    setExpiresAt("");
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3">
        <CopySecretBox label="Clé API" value={created.fullKey} />
        <button type="button" onClick={() => setCreated(undefined)} className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Créer une autre clé
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="api-key-name" className="text-sm font-medium text-neutral-700">
        Nom
      </label>
      <input
        id="api-key-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ex. n8n production"
        className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm"
      />

      <span className="text-sm font-medium text-neutral-700">Scopes</span>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {API_KEY_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-1.5 text-sm text-neutral-700">
            <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
            {API_KEY_SCOPE_LABELS[scope]}
          </label>
        ))}
      </div>

      <span className="text-sm font-medium text-neutral-700">Restriction client (facultatif)</span>
      <p className="text-xs text-neutral-500">Aucune sélection = accès à toute l&apos;organisation (selon les scopes). Une sélection restreint strictement aux clients cochés.</p>
      {clients.length === 0 ? (
        <p className="text-xs text-neutral-500">Aucun client actif.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded border border-neutral-200 p-2">
          {clients.map((client) => (
            <label key={client.id} className="flex items-center gap-1.5 text-sm text-neutral-700">
              <input type="checkbox" checked={allowedClientAccountIds.includes(client.id)} onChange={() => toggleClient(client.id)} />
              {client.name}
            </label>
          ))}
        </div>
      )}

      <label htmlFor="api-key-expires" className="text-sm font-medium text-neutral-700">
        Expiration (facultatif)
      </label>
      <input id="api-key-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="max-w-xs rounded border border-neutral-300 px-3 py-2 text-sm" />

      <button type="button" disabled={isPending} onClick={handleCreate} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer la clé"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
