import type { Metadata } from "next";
import { CreateKnowledgeEntryForm } from "./create-knowledge-entry-form";

export const metadata: Metadata = { title: "Nouvelle entrée — Base de connaissances — TenderOS" };

export default function NewKnowledgeEntryPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvelle entrée</h1>
      <CreateKnowledgeEntryForm />
    </div>
  );
}
