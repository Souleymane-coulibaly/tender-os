"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientAccountSummary } from "../../../../../lib/client-portfolio-types";
import { GOVERNED_WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_TYPE_LABELS, type GovernedWebhookEventType } from "../../../../../lib/integrations-types";
import { createWebhookAction } from "../../../integrations-actions";
import { CopySecretBox } from "../copy-secret-box";

export function CreateWebhookForm({ clients }: { clients: ClientAccountSummary[] }) {
  const router = useRouter();
  const [endpointUrl, setEndpointUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<GovernedWebhookEventType[]>([]);
  const [allowedClientAccountIds, setAllowedClientAccountIds] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ secret: string; subscriptionId: string } | undefined>();

  function toggleEvent(eventType: GovernedWebhookEventType) {
    setEvents((current) => (current.includes(eventType) ? current.filter((e) => e !== eventType) : [...current, eventType]));
  }

  function toggleClient(clientId: string) {
    setAllowedClientAccountIds((current) => (current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId]));
  }

  async function handleCreate() {
    if (!endpointUrl.trim()) {
      setError("L'URL de destination est obligatoire.");
      return;
    }
    if (events.length === 0) {
      setError("Sélectionnez au moins un événement.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await createWebhookAction({ endpointUrl: endpointUrl.trim(), description: description.trim() || undefined, events, allowedClientAccountIds });
    setIsPending(false);
    if (result.error || !result.secret || !result.subscription) {
      setError(result.error ?? "Erreur inattendue.");
      return;
    }
    setCreated({ secret: result.secret, subscriptionId: result.subscription.id });
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3">
        <CopySecretBox label="Secret de signature (whsec_…)" value={created.secret} />
        <p className="text-xs text-neutral-500">
          Utilisez ce secret pour vérifier la signature HMAC-SHA256 des en-têtes <code>X-TenderOS-Signature</code>. Il ne sera plus jamais affiché.
        </p>
        <button type="button" onClick={() => router.push(`/app/integrations/webhooks/${created.subscriptionId}`)} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Voir le webhook
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="webhook-url" className="text-sm font-medium text-neutral-700">
        URL de destination
      </label>
      <input
        id="webhook-url"
        value={endpointUrl}
        onChange={(e) => setEndpointUrl(e.target.value)}
        placeholder="https://…"
        className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm"
      />

      <label htmlFor="webhook-description" className="text-sm font-medium text-neutral-700">
        Description (facultatif)
      </label>
      <input id="webhook-description" value={description} onChange={(e) => setDescription(e.target.value)} className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />

      <span className="text-sm font-medium text-neutral-700">Événements</span>
      <div className="flex flex-col gap-1.5">
        {GOVERNED_WEBHOOK_EVENT_TYPES.map((eventType) => (
          <label key={eventType} className="flex items-center gap-1.5 text-sm text-neutral-700">
            <input type="checkbox" checked={events.includes(eventType)} onChange={() => toggleEvent(eventType)} />
            {WEBHOOK_EVENT_TYPE_LABELS[eventType]}
            <code className="text-xs text-neutral-400">{eventType}</code>
          </label>
        ))}
      </div>

      <span className="text-sm font-medium text-neutral-700">Restriction client (facultatif)</span>
      <p className="text-xs text-neutral-500">
        Aucune sélection = tous les événements de l&apos;organisation. Une sélection restreint aux clients cochés (uniquement pour les événements portant un client :{" "}
        {WEBHOOK_EVENT_TYPE_LABELS["tender.created"]}, {WEBHOOK_EVENT_TYPE_LABELS["response_package.validated"]}, {WEBHOOK_EVENT_TYPE_LABELS["response_package.generated"]}).
      </p>
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

      <button type="button" disabled={isPending} onClick={handleCreate} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le webhook"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
