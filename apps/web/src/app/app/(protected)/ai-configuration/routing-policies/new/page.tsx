import type { Metadata } from "next";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { AiModelSummary } from "../../../../../../lib/ai-configuration-types";
import { ApiErrorState } from "../../../api-error-state";
import { CreateRoutingPolicyForm } from "./create-routing-policy-form";

export const metadata: Metadata = { title: "Nouvelle politique de routage — TenderOS" };

export default async function NewRoutingPolicyPage() {
  let models: AiModelSummary[];
  try {
    models = await appApiFetch<AiModelSummary[]>("/api/v1/ai-models?enabledForProduction=true");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvelle politique de routage</h1>
      <CreateRoutingPolicyForm models={models} />
    </div>
  );
}
