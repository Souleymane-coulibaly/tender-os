"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input } from "../../../../../components/ui";
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
        <p className="text-xs text-tenderos-slate">
          Utilisez ce secret pour vérifier la signature HMAC-SHA256 des en-têtes <code>X-TenderOS-Signature</code>. Il ne sera plus jamais affiché.
        </p>
        <Button type="button" variant="primary" onClick={() => router.push(`/app/integrations/webhooks/${created.subscriptionId}`)} className="self-start">
          Voir le webhook
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input id="webhook-url" label="URL de destination" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://…" wrapperClassName="max-w-md" />

      <Input id="webhook-description" label="Description (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} wrapperClassName="max-w-md" />

      <span className="text-sm font-medium text-tenderos-navy">Événements</span>
      <div className="flex flex-col gap-1.5">
        {GOVERNED_WEBHOOK_EVENT_TYPES.map((eventType) => (
          <Checkbox
            key={eventType}
            checked={events.includes(eventType)}
            onChange={() => toggleEvent(eventType)}
            label={
              <>
                {WEBHOOK_EVENT_TYPE_LABELS[eventType]}
                <code className="font-mono text-xs text-tenderos-slate/70">{eventType}</code>
              </>
            }
          />
        ))}
      </div>

      <span className="text-sm font-medium text-tenderos-navy">Restriction client (facultatif)</span>
      <p className="text-xs text-tenderos-slate">
        Aucune sélection = tous les événements de l&apos;organisation. Une sélection restreint aux clients cochés (uniquement pour les événements portant un client :{" "}
        {WEBHOOK_EVENT_TYPE_LABELS["tender.created"]}, {WEBHOOK_EVENT_TYPE_LABELS["response_package.validated"]}, {WEBHOOK_EVENT_TYPE_LABELS["response_package.generated"]}).
      </p>
      {clients.length === 0 ? (
        <p className="text-xs text-tenderos-slate">Aucun client actif.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-tenderos-navy/10 p-2">
          {clients.map((client) => (
            <Checkbox key={client.id} label={client.name} checked={allowedClientAccountIds.includes(client.id)} onChange={() => toggleClient(client.id)} />
          ))}
        </div>
      )}

      <Button type="button" variant="primary" disabled={isPending} onClick={handleCreate} className="self-start">
        {isPending ? "Création..." : "Créer le webhook"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
