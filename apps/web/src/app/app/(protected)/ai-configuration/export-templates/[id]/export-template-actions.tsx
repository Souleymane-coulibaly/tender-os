"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Select, Textarea } from "../../../../../../components/ui";
import { activateExportTemplateVersionAction, createExportTemplateVersionAction } from "../../../../export-actions";
import { EXPORT_TEMPLATE_VERSION_STATUS_LABELS, EXPORT_TEMPLATE_VERSION_STATUS_TONE, type ExportTemplateVersionSummary } from "../../../../../../lib/export-types";

export function ExportTemplateVersionManager({ templateId, activeVersion, defaultConfig }: { templateId: string; activeVersion?: ExportTemplateVersionSummary | undefined; defaultConfig: string }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [format, setFormat] = useState(activeVersion?.format ?? "DOCX");
  const [config, setConfig] = useState(defaultConfig);
  const [createdVersion, setCreatedVersion] = useState<ExportTemplateVersionSummary | undefined>();

  async function handleCreateVersion() {
    setIsPending(true);
    setError(undefined);
    const result = await createExportTemplateVersionAction(templateId, format, config);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setCreatedVersion(result.version);
      setIsCreating(false);
    }
  }

  async function handleActivate(versionId: string) {
    setIsPending(true);
    setError(undefined);
    const result = await activateExportTemplateVersionAction(templateId, versionId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setCreatedVersion(undefined);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {createdVersion ? (
        <Alert tone="warning">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-tenderos-navy">Nouvelle version v{createdVersion.version} créée</span>
              <Badge tone={EXPORT_TEMPLATE_VERSION_STATUS_TONE[createdVersion.status] ?? "neutral"}>
                {EXPORT_TEMPLATE_VERSION_STATUS_LABELS[createdVersion.status] ?? createdVersion.status}
              </Badge>
            </div>
            <Button type="button" variant="primary" disabled={isPending} onClick={() => handleActivate(createdVersion.id)} className="self-start">
              Activer cette version
            </Button>
          </div>
        </Alert>
      ) : null}

      {!isCreating ? (
        <Button type="button" onClick={() => setIsCreating(true)} className="self-start">
          Créer une nouvelle version
        </Button>
      ) : (
        <Card padding="tight">
          <div className="flex flex-col gap-3">
            <Select id="new-version-format" label="Format" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="DOCX">DOCX</option>
              <option value="PDF">PDF</option>
            </Select>
            <Textarea id="new-version-config" label="Configuration (JSON)" value={config} onChange={(e) => setConfig(e.target.value)} rows={14} className="font-mono" />
            <div className="flex gap-2">
              <Button type="button" variant="primary" disabled={isPending} onClick={handleCreateVersion}>
                {isPending ? "Création..." : "Créer la version"}
              </Button>
              <Button type="button" onClick={() => setIsCreating(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
