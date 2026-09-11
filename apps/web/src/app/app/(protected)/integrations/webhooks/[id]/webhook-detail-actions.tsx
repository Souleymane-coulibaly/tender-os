"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../../components/ui";
import { deleteWebhookAction, retryWebhookDeliveryAction, sendTestWebhookEventAction, setWebhookStatusAction } from "../../../../integrations-actions";

export function SendTestEventButton({ subscriptionId }: { subscriptionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await sendTestWebhookEventAction(subscriptionId);
            setMessage(result.error ?? "Événement de test envoyé — il apparaîtra dans le journal ci-dessous.");
          })
        }
      >
        {isPending ? "Envoi..." : "Envoyer un événement de test"}
      </Button>
      {message ? <p className="text-xs text-tenderos-slate">{message}</p> : null}
    </div>
  );
}

export function ToggleWebhookStatusButton({ subscriptionId, currentlyEnabled }: { subscriptionId: string; currentlyEnabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await setWebhookStatusAction(subscriptionId, !currentlyEnabled);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {isPending ? "..." : currentlyEnabled ? "Désactiver" : "Activer"}
      </Button>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
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
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Supprimer
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-danger-bg p-3">
      <p className="text-sm font-medium text-danger-fg">Supprimer ce webhook ? Il ne recevra plus aucune livraison, et cette action est irréversible.</p>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteWebhookAction(subscriptionId);
              if (result.error) setError(result.error);
              else router.push("/app/integrations/webhooks");
            })
          }
        >
          {isPending ? "Suppression..." : "Confirmer la suppression"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Annuler
        </Button>
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryWebhookDeliveryAction(subscriptionId, deliveryId);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {isPending ? "..." : "Relancer"}
      </Button>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}
