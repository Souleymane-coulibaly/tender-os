import type { Metadata } from "next";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { AllowedModelCatalog } from "../../../../../../lib/ai-configuration-types";
import { ApiErrorState } from "../../../api-error-state";
import { CreateAiModelForm } from "./create-ai-model-form";

export const metadata: Metadata = { title: "Nouveau modèle IA — TenderOS" };

export default async function NewAiModelPage() {
  let catalog: AllowedModelCatalog;
  try {
    catalog = await appApiFetch<AllowedModelCatalog>("/api/v1/ai-models/allowed-catalog");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Enregistrer un modèle IA</h1>
      <CreateAiModelForm catalog={catalog} />
    </div>
  );
}
