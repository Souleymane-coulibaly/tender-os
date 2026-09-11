import type { Metadata } from "next";
import { Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../../components/ui";
import { getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  WEBHOOK_DELIVERY_STATUS_LABELS,
  WEBHOOK_DELIVERY_STATUS_TONE,
  WEBHOOK_EVENT_TYPE_LABELS,
  WEBHOOK_SUBSCRIPTION_STATUS_LABELS,
  WEBHOOK_SUBSCRIPTION_STATUS_TONE,
  canManageIntegrations,
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
      <Button variant="link" href="/app/integrations/webhooks" className="self-start">
        ← Webhooks
      </Button>

      {/* Actions dans le corps (et non `actions` de Card, `shrink-0`) : les confirmations de
          suppression s'y déplient et doivent pouvoir passer à la ligne sur mobile. */}
      <Card title={<span className="break-all">{subscription.endpointUrl}</span>} description={subscription.description}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Badge tone={WEBHOOK_SUBSCRIPTION_STATUS_TONE[subscription.status]}>{WEBHOOK_SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Badge>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <SendTestEventButton subscriptionId={subscription.id} />
              <ToggleWebhookStatusButton subscriptionId={subscription.id} currentlyEnabled={subscription.status === "ACTIVE"} />
              <DeleteWebhookButton subscriptionId={subscription.id} />
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-1 text-sm text-tenderos-slate">
          <p>
            <span className="font-medium text-tenderos-navy">Événements :</span>{" "}
            {subscription.events.map((eventType) => WEBHOOK_EVENT_TYPE_LABELS[eventType as keyof typeof WEBHOOK_EVENT_TYPE_LABELS] ?? eventType).join(", ")}
          </p>
          <p>
            <span className="font-medium text-tenderos-navy">Restriction client :</span>{" "}
            {subscription.allowedClientAccountIds.length === 0 ? "Toute l'organisation" : `${subscription.allowedClientAccountIds.length} client(s)`}
          </p>
          <p>
            <span className="font-medium text-tenderos-navy">Créé le :</span> {new Date(subscription.createdAt).toLocaleString("fr-FR")}
          </p>
        </div>
      </Card>

      <Card title="Journal des livraisons">
        {deliveries.items.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune livraison pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Événement</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
                <TableHeaderCell>Tentatives</TableHeaderCell>
                <TableHeaderCell>Code HTTP</TableHeaderCell>
                <TableHeaderCell>Créé le</TableHeaderCell>
                <TableHeaderCell>Erreur</TableHeaderCell>
                {canManage ? <TableHeaderCell>Actions</TableHeaderCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {deliveries.items.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="text-tenderos-slate">{WEBHOOK_EVENT_TYPE_LABELS[delivery.eventType as keyof typeof WEBHOOK_EVENT_TYPE_LABELS] ?? delivery.eventType}</TableCell>
                  <TableCell>
                    <Badge tone={WEBHOOK_DELIVERY_STATUS_TONE[delivery.status]}>{WEBHOOK_DELIVERY_STATUS_LABELS[delivery.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{delivery.attemptCount}</TableCell>
                  <TableCell className="text-tenderos-slate">{delivery.httpStatus ?? "—"}</TableCell>
                  <TableCell className="text-tenderos-slate">{new Date(delivery.createdAt).toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="max-w-xs truncate text-tenderos-slate" title={delivery.errorSummary}>
                    {delivery.errorSummary ?? "—"}
                  </TableCell>
                  {canManage ? (
                    <TableCell>{delivery.status === "DEAD" || delivery.status === "RETRYING" ? <RetryDeliveryButton subscriptionId={subscription.id} deliveryId={delivery.id} /> : null}</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
