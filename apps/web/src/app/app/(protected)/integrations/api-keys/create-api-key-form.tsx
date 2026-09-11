"use client";

import { useState } from "react";
import { Button, Checkbox, Input } from "../../../../../components/ui";
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
        <Button type="button" variant="secondary" size="sm" onClick={() => setCreated(undefined)} className="self-start">
          Créer une autre clé
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input id="api-key-name" label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. n8n production" wrapperClassName="max-w-md" />

      <span className="text-sm font-medium text-tenderos-navy">Scopes</span>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {API_KEY_SCOPES.map((scope) => (
          <Checkbox key={scope} label={API_KEY_SCOPE_LABELS[scope]} checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
        ))}
      </div>

      <span className="text-sm font-medium text-tenderos-navy">Restriction client (facultatif)</span>
      <p className="text-xs text-tenderos-slate">Aucune sélection = accès à toute l&apos;organisation (selon les scopes). Une sélection restreint strictement aux clients cochés.</p>
      {clients.length === 0 ? (
        <p className="text-xs text-tenderos-slate">Aucun client actif.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-tenderos-navy/10 p-2">
          {clients.map((client) => (
            <Checkbox key={client.id} label={client.name} checked={allowedClientAccountIds.includes(client.id)} onChange={() => toggleClient(client.id)} />
          ))}
        </div>
      )}

      <Input id="api-key-expires" label="Expiration (facultatif)" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} wrapperClassName="max-w-xs" />

      <Button type="button" variant="primary" disabled={isPending} onClick={handleCreate} className="self-start">
        {isPending ? "Création..." : "Créer la clé"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
