import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  AI_MODEL_STATUS_LABELS,
  AI_MODEL_STATUS_TONE,
  AI_PROVIDER_LABELS,
  type AiModelSummary,
} from "../../../../../lib/ai-configuration-types";
import { isOrganizationAdmin } from "../../../../../lib/authorization";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Configuration IA — Modèles — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageAi = isOrganizationAdmin;

export default async function AiModelsListPage() {
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [models, actorRole] = await Promise.all([
      appApiFetch<AiModelSummary[]>("/api/v1/ai-models"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);

  return (
    <div data-tour="guide-ai-configuration-list" className="flex flex-col gap-4">
      <Card
        title="Modèles IA"
        description="Registre des modèles autorisés à être benchmarkés ou utilisés en production. Aucun modèle en dehors de cette liste ne peut être appelé par TenderOS."
        actions={
          canManage ? (
            <div data-tour="guide-ai-configuration-create" className="flex">
              <Button href="/app/ai-configuration/models/new" variant="primary">
                Enregistrer un modèle
              </Button>
            </div>
          ) : null
        }
      >
        {models.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun modèle enregistré pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nom</TableHeaderCell>
                <TableHeaderCell>Fournisseur</TableHeaderCell>
                <TableHeaderCell>Identifiant modèle</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
                <TableHeaderCell>Benchmark</TableHeaderCell>
                <TableHeaderCell>Production</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <Link href={`/app/ai-configuration/models/${model.id}`} className="font-medium text-tenderos-navy hover:underline">
                      {model.displayName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{AI_PROVIDER_LABELS[model.provider] ?? model.provider}</TableCell>
                  <TableCell className="text-tenderos-slate">{model.modelKey}</TableCell>
                  <TableCell>
                    <Badge tone={AI_MODEL_STATUS_TONE[model.status]}>{AI_MODEL_STATUS_LABELS[model.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{model.enabledForBenchmark ? "Oui" : "Non"}</TableCell>
                  <TableCell className="text-tenderos-slate">{model.enabledForProduction ? "Oui" : "Non"}</TableCell>
                  <TableCell>
                    <Link href={`/app/ai-configuration/models/${model.id}`} className="text-tenderos-blue hover:underline">
                      Ouvrir
                    </Link>
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
