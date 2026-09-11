import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
import { ImportKnowledgeDocumentForm } from "./import-knowledge-document-form";

export const metadata: Metadata = { title: "Importer un document — Base de connaissances — TenderOS" };

export default function ImportKnowledgeDocumentPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Base de connaissances", href: "/app/knowledge" }, { label: "Importer un document" }]}
        title="Importer un document"
        description={
          <>
            Crée une nouvelle entrée de connaissance à partir d&apos;un document (PDF, Word, Excel, texte). Le contenu est extrait et
            indexé automatiquement.
          </>
        }
      />
      <ImportKnowledgeDocumentForm />
    </div>
  );
}
