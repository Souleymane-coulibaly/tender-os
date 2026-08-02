import type { Metadata } from "next";
import { CreateExportTemplateForm } from "./create-export-template-form";

export const metadata: Metadata = { title: "Nouveau template d'export — TenderOS" };

export default function NewExportTemplatePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouveau template d&apos;export</h1>
      <CreateExportTemplateForm />
    </div>
  );
}
