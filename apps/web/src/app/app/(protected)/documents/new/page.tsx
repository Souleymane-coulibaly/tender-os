import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
import { CreateDocumentForm } from "./create-document-form";

export const metadata: Metadata = { title: "Nouveau document — TenderOS" };

export default function NewDocumentPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={[{ label: "Documents", href: "/app/documents" }, { label: "Nouveau document" }]} title="Nouveau document" />
      <CreateDocumentForm />
    </div>
  );
}
