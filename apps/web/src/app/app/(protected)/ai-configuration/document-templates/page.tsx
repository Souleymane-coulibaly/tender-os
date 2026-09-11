import type { Metadata } from "next";
import { Card } from "../../../../../components/ui";
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
      <Card
        title="Templates documentaires"
        description={
          <>
            Moteur documentaire générique — uploadez un fichier .docx réel contenant des placeholders (ex.{" "}
            <code className="rounded bg-tenderos-light px-1 py-0.5">{"{{tender.reference}}"}</code>), le fichier n&apos;est jamais modifié en place : chaque
            évolution crée une nouvelle version. Réservé OWNER/Administrateur.
          </>
        }
      >
        <DocumentTemplatesSection initialTemplates={templates} actorRole={actorRole} />
      </Card>
    </div>
  );
}
