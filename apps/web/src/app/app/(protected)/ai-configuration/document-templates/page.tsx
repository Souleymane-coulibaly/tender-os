import type { Metadata } from "next";
import { getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { fetchDocumentTemplates } from "../../../document-generation-actions";
import { ApiErrorState } from "../../api-error-state";
import { DocumentTemplatesSection } from "./document-templates-section";

export const metadata: Metadata = { title: "Templates documentaires — TenderOS" };

export default async function DocumentTemplatesListPage() {
  let templates;
  let actorRole: string | undefined;
  try {
    [templates, actorRole] = await Promise.all([fetchDocumentTemplates(), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Templates documentaires</h1>
        <p className="text-sm text-neutral-600">
          Moteur documentaire générique — uploadez un fichier .docx réel contenant des placeholders (ex.{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5">{"{{tender.reference}}"}</code>), le fichier n&apos;est jamais modifié en place : chaque
          évolution crée une nouvelle version. Réservé OWNER/Administrateur.
        </p>
      </div>
      <DocumentTemplatesSection initialTemplates={templates} actorRole={actorRole} />
    </div>
  );
}
