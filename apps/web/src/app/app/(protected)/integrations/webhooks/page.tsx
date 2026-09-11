import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { WEBHOOK_SUBSCRIPTION_STATUS_LABELS, WEBHOOK_SUBSCRIPTION_STATUS_TONE, canManageIntegrations, type WebhookSubscriptionSummary } from "../../../../../lib/integrations-types";
import { fetchWebhooks } from "../../../integrations-actions";
import { fetchEntitlements } from "../../../billing-actions";
import { ApiErrorState } from "../../api-error-state";
import { EntitlementUpgradeNotice } from "../../entitlement-upgrade-notice";
import { CreateWebhookForm } from "./create-webhook-form";

export const metadata: Metadata = { title: "Webhooks — TenderOS" };

export default async function WebhooksPage() {
  let webhooks: WebhookSubscriptionSummary[];
  let clients: ClientAccountSummary[];
  let actorRole: string | undefined;
  let hasWebhooksEntitlement = false;
  try {
    const [webhooksResult, clientsResult, actorRoleResult, entitlements] = await Promise.all([
      fetchWebhooks(),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE").then((page) => page.items),
      getCurrentMembershipRole(),
      fetchEntitlements(),
    ]);
    webhooks = webhooksResult;
    clients = clientsResult;
    actorRole = actorRoleResult;
    hasWebhooksEntitlement = entitlements.entitlements.includes("WEBHOOKS");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageIntegrations(actorRole);

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        hasWebhooksEntitlement ? (
          <Card title="Nouveau webhook">
            <CreateWebhookForm clients={clients} />
          </Card>
        ) : (
          <EntitlementUpgradeNotice featureLabel="Les webhooks" />
        )
      ) : null}

      <Card title="Webhooks existants">
        {webhooks.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun webhook pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Endpoint</TableHeaderCell>
                <TableHeaderCell>Événements</TableHeaderCell>
                <TableHeaderCell>Restriction client</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell>
                    <Link href={`/app/integrations/webhooks/${webhook.id}`} className="font-medium text-tenderos-navy hover:underline">
                      {webhook.endpointUrl}
                    </Link>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{webhook.events.length} événement(s)</TableCell>
                  <TableCell className="text-tenderos-slate">{webhook.allowedClientAccountIds.length === 0 ? "Toute l'organisation" : `${webhook.allowedClientAccountIds.length} client(s)`}</TableCell>
                  <TableCell>
                    <Badge tone={WEBHOOK_SUBSCRIPTION_STATUS_TONE[webhook.status]}>{WEBHOOK_SUBSCRIPTION_STATUS_LABELS[webhook.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
