import type { Metadata } from "next";
import { getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { fetchDocumentTemplates, fetchGeneratedDocuments } from "../../../../document-generation-actions";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
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
      <PageHeader
        guideKey="tender-documents-generated"
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Documents générés" }]}
        title="Documents générés"
        description="Générez un document DOCX éditable à partir d'un template activé. Un champ requis manquant bloque la génération, sauf si le template autorise la génération partielle — la valeur n'est alors jamais inventée, elle apparaît dans « Champs manquants »."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/documents-generated`} />
      <DocumentsGeneratedSection tenderId={tenderId} initialGeneratedDocuments={generatedDocuments} templates={availableTemplates} actorRole={actorRole} />
    </div>
  );
}
