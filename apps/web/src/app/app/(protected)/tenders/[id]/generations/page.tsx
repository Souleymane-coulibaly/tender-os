import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { GENERATION_TASK_TYPE_LABELS, type GenerationSummary } from "../../../../../../lib/generation-types";
import { ApiErrorState } from "../../../api-error-state";
import { GenerationSection } from "./generation-section";

export const metadata: Metadata = { title: "Générations — TenderOS" };

export default async function TenderGenerationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let generations: { items: GenerationSummary[]; total: number };
  let actorRole: string | undefined;
  try {
    [generations, actorRole] = await Promise.all([
      appApiFetch<{ items: GenerationSummary[]; total: number }>(`/api/v1/tenders/${tenderId}/generations?limit=50&offset=0`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Générations de contenu</h1>
        <p className="text-sm text-neutral-600">
          Contenus générés par IA pour ce Tender, à partir des analyses, de la Base de connaissances et de prompts
          versionnés. Toute génération doit être relue et validée par un humain avant utilisation.
        </p>
      </div>
      <GenerationSection tenderId={tenderId} initialGenerations={generations.items} actorRole={actorRole} taskTypeLabels={GENERATION_TASK_TYPE_LABELS} />
    </div>
  );
}
