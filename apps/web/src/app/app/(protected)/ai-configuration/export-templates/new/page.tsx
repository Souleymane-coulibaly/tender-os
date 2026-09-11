import type { Metadata } from "next";
import { Button, Card } from "../../../../../../components/ui";
import { CreateExportTemplateForm } from "./create-export-template-form";

export const metadata: Metadata = { title: "Nouveau template d'export — TenderOS" };

export default function NewExportTemplatePage() {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="link" href="/app/ai-configuration/export-templates" className="self-start">
        ← Templates d&apos;export
      </Button>
      <Card title="Nouveau template d'export">
        <CreateExportTemplateForm />
      </Card>
    </div>
  );
}
