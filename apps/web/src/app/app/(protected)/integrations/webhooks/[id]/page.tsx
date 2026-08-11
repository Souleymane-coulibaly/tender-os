import type { Metadata } from "next";
import { getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  WEBHOOK_DELIVERY_STATUS_LABELS,
  WEBHOOK_EVENT_TYPE_LABELS,
  WEBHOOK_SUBSCRIPTION_STATUS_LABELS,
  canManageIntegrations,
  webhookDeliveryStatusBadgeClass,
  webhookSubscriptionStatusBadgeClass,
  type WebhookDeliveryPage,
  type WebhookSubscriptionSummary,
} from "../../../../../../lib/integrations-types";
import { fetchWebhook, fetchWebhookDeliveries } from "../../../../integrations-actions";
import { ApiErrorState } from "../../../api-error-state";
import { DeleteWebhookButton, RetryDeliveryButton, SendTestEventButton, ToggleWebhookStatusButton } from "./webhook-detail-actions";

export const metadata: Metadata = { title: "Détail du webhook — TenderOS" };

export default async function WebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let subscription: WebhookSubscriptionSummary;
  let deliveries: WebhookDeliveryPage;
  let actorRole: string | undefined;
  try {
    [subscription, deliveries, actorRole] = await Promise.all([fetchWebhook(id), fetchWebhookDeliveries(id), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageIntegrations(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded border border-neutral-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{subscription.endpointUrl}</h2>
            {subscription.description ? <p className="text-sm text-neutral-600">{subscription.description}</p> : null}
            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${webhookSubscriptionStatusBadgeClass(subscription.status)}`}>
              {WEBHOOK_SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </span>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <SendTestEventButton subscriptionId={subscription.id} />
              <ToggleWebhookStatusButton subscriptionId={subscription.id} currentlyEnabled={subscription.status === "ACTIVE"} />
              <DeleteWebhookButton subscriptionId={subscription.id} />
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-1 text-sm text-neutral-600">
          <p>
            <span className="font-medium text-neutral-700">Événements :</span>{" "}
            {subscription.events.map((eventType) => WEBHOOK_EVENT_TYPE_LABELS[eventType as keyof typeof WEBHOOK_EVENT_TYPE_LABELS] ?? eventType).join(", ")}
          </p>
          <p>
            <span className="font-medium text-neutral-700">Restriction client :</span>{" "}
            {subscription.allowedClientAccountIds.length === 0 ? "Toute l'organisation" : `${subscription.allowedClientAccountIds.length} client(s)`}
          </p>
          <p>
            <span className="font-medium text-neutral-700">Créé le :</span> {new Date(subscription.createdAt).toLocaleString("fr-FR")}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Journal des livraisons</h2>
        {deliveries.items.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucune livraison pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Événement</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Tentatives</th>
                  <th className="py-2 pr-4">Code HTTP</th>
                  <th className="py-2 pr-4">Créé le</th>
                  <th className="py-2 pr-4">Erreur</th>
                  {canManage ? <th className="py-2 pr-4">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {deliveries.items.map((delivery) => (
                  <tr key={delivery.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 text-neutral-600">{WEBHOOK_EVENT_TYPE_LABELS[delivery.eventType as keyof typeof WEBHOOK_EVENT_TYPE_LABELS] ?? delivery.eventType}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${webhookDeliveryStatusBadgeClass(delivery.status)}`}>{WEBHOOK_DELIVERY_STATUS_LABELS[delivery.status]}</span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{delivery.attemptCount}</td>
                    <td className="py-2 pr-4 text-neutral-600">{delivery.httpStatus ?? "—"}</td>
                    <td className="py-2 pr-4 text-neutral-600">{new Date(delivery.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="py-2 pr-4 max-w-xs truncate text-neutral-600" title={delivery.errorSummary}>
                      {delivery.errorSummary ?? "—"}
                    </td>
                    {canManage ? (
                      <td className="py-2 pr-4">{delivery.status === "DEAD" || delivery.status === "RETRYING" ? <RetryDeliveryButton subscriptionId={subscription.id} deliveryId={delivery.id} /> : null}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
