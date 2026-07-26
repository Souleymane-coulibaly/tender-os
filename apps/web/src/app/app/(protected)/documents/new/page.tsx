import type { Metadata } from "next";
import { CreateDocumentForm } from "./create-document-form";

export const metadata: Metadata = { title: "Nouveau document — TenderOS" };

export default function NewDocumentPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouveau document</h1>
      <CreateDocumentForm />
    </div>
  );
}
