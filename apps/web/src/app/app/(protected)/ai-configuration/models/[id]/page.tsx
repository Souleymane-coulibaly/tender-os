import type { Metadata } from "next";
import { Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  AI_MODEL_STATUS_LABELS,
  AI_MODEL_STATUS_TONE,
  type AiModelSummary,
  type PricingSnapshotSummary,
} from "../../../../../../lib/ai-configuration-types";
import { isOrganizationAdmin } from "../../../../../../lib/authorization";
import { ApiErrorState } from "../../../api-error-state";
import { AddPricingSnapshotForm, AiModelProductionToggle, AiModelStatusToggle } from "./ai-model-actions";

export const metadata: Metadata = { title: "Détail du modèle — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageAi = isOrganizationAdmin;

export default async function AiModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let model: AiModelSummary;
  let pricingHistory: PricingSnapshotSummary[];
  let actorRole: string | undefined;
  try {
    [model, pricingHistory, actorRole] = await Promise.all([
      appApiFetch<AiModelSummary>(`/api/v1/ai-models/${id}`),
      appApiFetch<PricingSnapshotSummary[]>(`/api/v1/ai-models/${id}/pricing`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);
  const currentPricing = pricingHistory.find((snapshot) => !snapshot.effectiveTo);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="link" href="/app/ai-configuration/models" className="self-start">
        ← Modèles
      </Button>

      <Card
        title={model.displayName}
        description={
          <>
            {model.provider} · {model.modelKey}
          </>
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            <Badge tone={AI_MODEL_STATUS_TONE[model.status]}>{AI_MODEL_STATUS_LABELS[model.status]}</Badge>
            {canManage ? <AiModelStatusToggle model={model} /> : null}
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-tenderos-slate">Benchmark autorisé</dt>
            <dd className="font-medium text-tenderos-navy">{model.enabledForBenchmark ? "Oui" : "Non"}</dd>
          </div>
          <div>
            <dt className="text-tenderos-slate">Production autorisée</dt>
            <dd className="flex items-center gap-3 font-medium text-tenderos-navy">
              {model.enabledForProduction ? "Oui" : "Non"}
              {canManage ? <AiModelProductionToggle model={model} /> : null}
            </dd>
          </div>
          <div>
            <dt className="text-tenderos-slate">Sortie structurée</dt>
            <dd className="font-medium text-tenderos-navy">{model.capabilities.supportsStructuredOutput ? "Oui" : "Non"}</dd>
          </div>
          <div>
            <dt className="text-tenderos-slate">Fenêtre de contexte max.</dt>
            <dd className="font-medium text-tenderos-navy">{model.maxContextTokens ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Tarification">
        <div className="flex flex-col gap-3">
          {currentPricing ? (
            <p className="text-sm text-tenderos-navy">
              Tarif actif : {currentPricing.inputPricePerMillionTokens} {currentPricing.currency} / M tokens entrée ·{" "}
              {currentPricing.outputPricePerMillionTokens} {currentPricing.currency} / M tokens sortie (depuis le{" "}
              {new Date(currentPricing.effectiveFrom).toLocaleDateString("fr-FR")})
            </p>
          ) : (
            <p className="text-sm text-tenderos-slate">Aucun tarif actif pour ce modèle.</p>
          )}

          {pricingHistory.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Entrée / M</TableHeaderCell>
                  <TableHeaderCell>Sortie / M</TableHeaderCell>
                  <TableHeaderCell>Devise</TableHeaderCell>
                  <TableHeaderCell>Du</TableHeaderCell>
                  <TableHeaderCell>Au</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pricingHistory.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell>{snapshot.inputPricePerMillionTokens}</TableCell>
                    <TableCell>{snapshot.outputPricePerMillionTokens}</TableCell>
                    <TableCell>{snapshot.currency}</TableCell>
                    <TableCell>{new Date(snapshot.effectiveFrom).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell>{snapshot.effectiveTo ? new Date(snapshot.effectiveTo).toLocaleDateString("fr-FR") : "Actif"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          {canManage ? <AddPricingSnapshotForm modelId={model.id} /> : null}
        </div>
      </Card>
    </div>
  );
}
