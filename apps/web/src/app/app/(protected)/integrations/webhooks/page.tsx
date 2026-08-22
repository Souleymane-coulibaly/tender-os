import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { WEBHOOK_SUBSCRIPTION_STATUS_LABELS, canManageIntegrations, webhookSubscriptionStatusBadgeClass, type WebhookSubscriptionSummary } from "../../../../../lib/integrations-types";
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
          <section className="rounded border border-neutral-200 p-4">
            <h2 className="mb-3 text-sm font-semibold">Nouveau webhook</h2>
            <CreateWebhookForm clients={clients} />
          </section>
        ) : (
          <EntitlementUpgradeNotice featureLabel="Les webhooks" />
        )
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Webhooks existants</h2>
        {webhooks.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun webhook pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Endpoint</th>
                  <th className="py-2 pr-4">Événements</th>
                  <th className="py-2 pr-4">Restriction client</th>
                  <th className="py-2 pr-4">Statut</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">
                      <Link href={`/app/integrations/webhooks/${webhook.id}`} className="font-medium text-neutral-900 hover:underline">
                        {webhook.endpointUrl}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{webhook.events.length} événement(s)</td>
                    <td className="py-2 pr-4 text-neutral-600">{webhook.allowedClientAccountIds.length === 0 ? "Toute l'organisation" : `${webhook.allowedClientAccountIds.length} client(s)`}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${webhookSubscriptionStatusBadgeClass(webhook.status)}`}>{WEBHOOK_SUBSCRIPTION_STATUS_LABELS[webhook.status]}</span>
                    </td>
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
