import type { Metadata } from "next";
import { CreatePromptTemplateForm } from "./create-prompt-template-form";

export const metadata: Metadata = { title: "Nouveau template de prompt — TenderOS" };

export default function NewPromptTemplatePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouveau template de prompt</h1>
      <CreatePromptTemplateForm />
    </div>
  );
}
