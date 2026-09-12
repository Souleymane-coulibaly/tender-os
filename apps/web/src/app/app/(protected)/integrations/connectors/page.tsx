import type { Metadata } from "next";
import { Alert } from "../../../../../components/ui";
import { getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { CONNECTOR_PROVIDERS, canManageConnectors, canUseConnectors, type ExternalConnectionSummary } from "../../../../../lib/connectors-types";
import { fetchDocumentsForPicker, fetchExternalConnections, fetchTendersForPicker } from "../../../connectors-actions";
import { fetchEntitlements } from "../../../billing-actions";
import { ApiErrorState } from "../../api-error-state";
import { ConnectorProviderCard } from "./connector-provider-card";

export const metadata: Metadata = { title: "Connecteurs — TenderOS" };

type SearchParams = { connectorConnected?: string; connectorError?: string };

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let connections: ExternalConnectionSummary[];
  let actorRole: string | undefined;
  let hasEntitlement = false;
  try {
    const [connectionsResult, actorRoleResult, entitlements] = await Promise.all([fetchExternalConnections(), getCurrentMembershipRole(), fetchEntitlements()]);
    connections = connectionsResult;
    actorRole = actorRoleResult;
    hasEntitlement = entitlements.entitlements.includes("AUTOMATION_CONNECTORS");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageConnectors(actorRole);
  const canUse = canUseConnectors(actorRole);

  // Les sélecteurs Tender/Document ne sont chargés que si au moins une connexion est utilisable —
  // évite deux appels réseau superflus pour un OWNER qui n'a encore rien connecté.
  const hasUsableConnection = connections.some((c) => c.status === "ACTIVE");
  const [tenders, documents] = hasUsableConnection && canUse ? await Promise.all([fetchTendersForPicker(), fetchDocumentsForPicker()]) : [[], []];

  return (
    <div className="flex flex-col gap-6">
      {/* `Alert` porte lui-même role="status" (success) / role="alert" (danger), comme les <p> précédents. */}
      {params.connectorConnected ? <Alert tone="success">Connexion établie avec succès.</Alert> : null}
      {params.connectorError ? <Alert tone="danger">La connexion a échoué ({params.connectorError}). Réessayez.</Alert> : null}

      <p className="text-sm text-tenderos-slate">
        Connectez l&apos;environnement Microsoft 365 ou Google Workspace de votre organisation pour importer/exporter des documents et synchroniser les échéances calendrier. TenderOS reste la source de
        vérité métier — connecter n&apos;élargit jamais vos droits d&apos;accès aux Clients/Tenders.
      </p>

      <div data-tour="guide-integrations-connectors" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {CONNECTOR_PROVIDERS.map((provider) => (
          <ConnectorProviderCard
            key={provider}
            provider={provider}
            connection={connections.find((c) => c.provider === provider && c.status !== "REVOKED")}
            canManage={canManage}
            canUse={canUse}
            hasEntitlement={hasEntitlement}
            tenders={tenders}
            documents={documents}
          />
        ))}
      </div>
    </div>
  );
}
