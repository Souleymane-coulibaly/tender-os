import type { Metadata } from "next";
import { ImportKnowledgeDocumentForm } from "./import-knowledge-document-form";

export const metadata: Metadata = { title: "Importer un document — Base de connaissances — TenderOS" };

export default function ImportKnowledgeDocumentPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Importer un document</h1>
      <p className="text-sm text-neutral-600">
        Crée une nouvelle entrée de connaissance à partir d&apos;un document (PDF, Word, Excel, texte). Le contenu est extrait et
        indexé automatiquement.
      </p>
      <ImportKnowledgeDocumentForm />
    </div>
  );
}
