import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { API_KEY_SCOPE_LABELS, API_KEY_STATUS_LABELS, apiKeyStatusBadgeClass, canManageIntegrations, type ApiKeySummary } from "../../../../../lib/integrations-types";
import { fetchApiKeys } from "../../../integrations-actions";
import { ApiErrorState } from "../../api-error-state";
import { CreateApiKeyForm } from "./create-api-key-form";
import { RevokeApiKeyButton } from "./revoke-api-key-button";

export const metadata: Metadata = { title: "Clés API — TenderOS" };

export default async function ApiKeysPage() {
  let apiKeys: ApiKeySummary[];
  let clients: ClientAccountSummary[];
  let actorRole: string | undefined;
  try {
    [apiKeys, clients, actorRole] = await Promise.all([
      fetchApiKeys(),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE").then((page) => page.items),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageIntegrations(actorRole);

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold">Nouvelle clé API</h2>
          <CreateApiKeyForm clients={clients} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Clés existantes</h2>
        {apiKeys.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucune clé API pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Nom</th>
                  <th className="py-2 pr-4">Préfixe</th>
                  <th className="py-2 pr-4">Scopes</th>
                  <th className="py-2 pr-4">Restriction client</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Dernière utilisation</th>
                  {canManage ? <th className="py-2 pr-4">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-medium text-neutral-900">{key.name}</td>
                    <td className="py-2 pr-4">
                      <code className="text-xs text-neutral-600">{key.keyPrefix}…</code>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{key.scopes.map((scope) => API_KEY_SCOPE_LABELS[scope] ?? scope).join(", ")}</td>
                    <td className="py-2 pr-4 text-neutral-600">{key.allowedClientAccountIds.length === 0 ? "Toute l'organisation" : `${key.allowedClientAccountIds.length} client(s)`}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${apiKeyStatusBadgeClass(key.status)}`}>{API_KEY_STATUS_LABELS[key.status]}</span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("fr-FR") : "Jamais"}</td>
                    {canManage ? <td className="py-2 pr-4">{key.status === "ACTIVE" ? <RevokeApiKeyButton apiKeyId={key.id} /> : null}</td> : null}
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
