import type { Metadata } from "next";
import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { API_KEY_SCOPE_LABELS, API_KEY_STATUS_LABELS, API_KEY_STATUS_TONE, canManageIntegrations, type ApiKeySummary } from "../../../../../lib/integrations-types";
import { fetchApiKeys } from "../../../integrations-actions";
import { fetchEntitlements } from "../../../billing-actions";
import { ApiErrorState } from "../../api-error-state";
import { EntitlementUpgradeNotice } from "../../entitlement-upgrade-notice";
import { CreateApiKeyForm } from "./create-api-key-form";
import { RevokeApiKeyButton } from "./revoke-api-key-button";

export const metadata: Metadata = { title: "Clés API — TenderOS" };

export default async function ApiKeysPage() {
  let apiKeys: ApiKeySummary[];
  let clients: ClientAccountSummary[];
  let actorRole: string | undefined;
  let hasPublicApiEntitlement = false;
  try {
    const [apiKeysResult, clientsResult, actorRoleResult, entitlements] = await Promise.all([
      fetchApiKeys(),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE").then((page) => page.items),
      getCurrentMembershipRole(),
      fetchEntitlements(),
    ]);
    apiKeys = apiKeysResult;
    clients = clientsResult;
    actorRole = actorRoleResult;
    hasPublicApiEntitlement = entitlements.entitlements.includes("PUBLIC_API");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageIntegrations(actorRole);

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        hasPublicApiEntitlement ? (
          <Card title="Nouvelle clé API">
            <CreateApiKeyForm clients={clients} />
          </Card>
        ) : (
          <EntitlementUpgradeNotice featureLabel="L'accès à l'API publique" />
        )
      ) : null}

      <Card title="Clés existantes">
        {apiKeys.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucune clé API pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nom</TableHeaderCell>
                <TableHeaderCell>Préfixe</TableHeaderCell>
                <TableHeaderCell>Scopes</TableHeaderCell>
                <TableHeaderCell>Restriction client</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
                <TableHeaderCell>Dernière utilisation</TableHeaderCell>
                {canManage ? <TableHeaderCell>Actions</TableHeaderCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium text-tenderos-navy">{key.name}</TableCell>
                  <TableCell>
                    <code className="text-xs text-tenderos-slate">{key.keyPrefix}…</code>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{key.scopes.map((scope) => API_KEY_SCOPE_LABELS[scope] ?? scope).join(", ")}</TableCell>
                  <TableCell className="text-tenderos-slate">{key.allowedClientAccountIds.length === 0 ? "Toute l'organisation" : `${key.allowedClientAccountIds.length} client(s)`}</TableCell>
                  <TableCell>
                    <Badge tone={API_KEY_STATUS_TONE[key.status]}>{API_KEY_STATUS_LABELS[key.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("fr-FR") : "Jamais"}</TableCell>
                  {canManage ? <TableCell>{key.status === "ACTIVE" ? <RevokeApiKeyButton apiKeyId={key.id} /> : null}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
