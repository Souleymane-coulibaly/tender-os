"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWebhookAction, retryWebhookDeliveryAction, sendTestWebhookEventAction, setWebhookStatusAction } from "../../../../integrations-actions";

export function SendTestEventButton({ subscriptionId }: { subscriptionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await sendTestWebhookEventAction(subscriptionId);
            setMessage(result.error ?? "Événement de test envoyé — il apparaîtra dans le journal ci-dessous.");
          })
        }
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        {isPending ? "Envoi..." : "Envoyer un événement de test"}
      </button>
      {message ? <p className="text-xs text-neutral-600">{message}</p> : null}
    </div>
  );
}

export function ToggleWebhookStatusButton({ subscriptionId, currentlyEnabled }: { subscriptionId: string; currentlyEnabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await setWebhookStatusAction(subscriptionId, !currentlyEnabled);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        {isPending ? "..." : currentlyEnabled ? "Désactiver" : "Activer"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function DeleteWebhookButton({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
        Supprimer
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-red-200 p-3">
      <p className="text-sm font-medium text-red-800">Supprimer ce webhook ? Il ne recevra plus aucune livraison, et cette action est irréversible.</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteWebhookAction(subscriptionId);
              if (result.error) setError(result.error);
              else router.push("/app/integrations/webhooks");
            })
          }
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Suppression..." : "Confirmer la suppression"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
          Annuler
        </button>
      </div>
    </div>
  );
}

export function RetryDeliveryButton({ subscriptionId, deliveryId }: { subscriptionId: string; deliveryId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryWebhookDeliveryAction(subscriptionId, deliveryId);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
      >
        {isPending ? "..." : "Relancer"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
