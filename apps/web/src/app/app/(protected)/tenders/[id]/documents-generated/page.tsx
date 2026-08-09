import type { Metadata } from "next";
import { getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { fetchDocumentTemplates, fetchGeneratedDocuments } from "../../../../document-generation-actions";
import { ApiErrorState } from "../../../api-error-state";
import { DocumentsGeneratedSection } from "./documents-generated-section";

export const metadata: Metadata = { title: "Documents générés — TenderOS" };

export default async function TenderDocumentsGeneratedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let generatedDocuments;
  let templates;
  let actorRole: string | undefined;
  try {
    [generatedDocuments, templates, actorRole] = await Promise.all([fetchGeneratedDocuments(tenderId), fetchDocumentTemplates(), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const availableTemplates = templates.filter((t) => t.activeVersion);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Documents générés</h1>
        <p className="text-sm text-neutral-600">
          Générez un document DOCX éditable à partir d&apos;un template activé. Un champ requis manquant bloque la génération, sauf si le template
          autorise la génération partielle — la valeur n&apos;est alors jamais inventée, elle apparaît dans « Champs manquants ».
        </p>
      </div>
      <DocumentsGeneratedSection tenderId={tenderId} initialGeneratedDocuments={generatedDocuments} templates={availableTemplates} actorRole={actorRole} />
    </div>
  );
}
