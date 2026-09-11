import type { Metadata } from "next";
import { Button, Card } from "../../../../../../components/ui";
import { CreatePromptTemplateForm } from "./create-prompt-template-form";

export const metadata: Metadata = { title: "Nouveau template de prompt — TenderOS" };

export default function NewPromptTemplatePage() {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="link" href="/app/ai-configuration/prompts" className="self-start">
        ← Prompts
      </Button>
      <Card title="Nouveau template de prompt">
        <CreatePromptTemplateForm />
      </Card>
    </div>
  );
}
