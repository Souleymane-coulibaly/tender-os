"use client";

import { useActionState, useState } from "react";
import {
  activateDocumentTemplateVersionAction,
  createDocumentTemplateAction,
  fetchDocumentTemplate,
  uploadDocumentTemplateVersionAction,
  type FormActionState,
  type UploadTemplateVersionFieldMapping,
} from "../../../document-generation-actions";
import {
  canManageDocumentTemplates,
  FIELD_TYPE_LABELS,
  type DocumentTemplateDetail,
  type DocumentTemplateSummary,
  type FieldType,
} from "../../../../../lib/document-generation-types";
import { VERSION_STATUS_LABELS } from "../../../../../lib/version-status";
import {
  Button,
  Card,
  Checkbox,
  FileInput,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};
const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];

function CreateTemplateForm() {
  const [state, formAction, isPending] = useActionState(
    createDocumentTemplateAction,
    INITIAL_STATE,
  );
  return (
    <Card padding="tight">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <Input
          label="Nom"
          name="name"
          type="text"
          required
          placeholder="Modèle de mémoire technique..."
          wrapperClassName="min-w-[10rem] flex-1"
        />
        <Select
          label="Portée"
          name="scope"
          defaultValue="ORGANIZATION"
          wrapperClassName="shrink-0 grow-0 basis-40"
        >
          <option value="ORGANIZATION">Organisation</option>
          <option value="SYSTEM">Système</option>
        </Select>
        <Input
          label="Description"
          name="description"
          type="text"
          wrapperClassName="min-w-[10rem] flex-1"
        />
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Création..." : "Créer le template"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function FieldMappingEditor({
  rows,
  onChange,
}: {
  rows: UploadTemplateVersionFieldMapping[];
  onChange: (rows: UploadTemplateVersionFieldMapping[]) => void;
}) {
  function updateRow(index: number, patch: Partial<UploadTemplateVersionFieldMapping>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }
  function addRow() {
    onChange([...rows, { fieldKey: "", label: "", fieldType: "STRING", required: false }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-tenderos-slate">
        Field Mapping — un placeholder doit correspondre EXACTEMENT à un tag présent dans le fichier
        (ex. <code className="rounded bg-tenderos-light px-1">tender.reference</code> pour{" "}
        <code className="rounded bg-tenderos-light px-1">{"{{tender.reference}}"}</code>).
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          {/* Largeur portée par un conteneur : `Input`/`Select` sans `label` rendent le contrôle nu
              en `w-full`, sans appliquer `wrapperClassName`. */}
          <div className="w-56">
            <Input
              placeholder="clé (ex. tender.reference)"
              value={row.fieldKey}
              onChange={(e) => updateRow(index, { fieldKey: e.target.value })}
            />
          </div>
          <div className="w-40">
            <Input
              placeholder="Libellé"
              value={row.label}
              onChange={(e) => updateRow(index, { label: e.target.value })}
            />
          </div>
          <div className="w-40">
            <Select
              value={row.fieldType}
              onChange={(e) => updateRow(index, { fieldType: e.target.value })}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FIELD_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
          <Checkbox
            label="Requis"
            checked={row.required}
            onChange={(e) => updateRow(index, { required: e.target.checked })}
          />
          <Button type="button" variant="danger" size="sm" onClick={() => removeRow(index)}>
            Retirer
          </Button>
        </div>
      ))}
      <Button type="button" variant="link" onClick={addRow} className="self-start text-xs">
        + Ajouter un champ
      </Button>
    </div>
  );
}

function UploadVersionForm({
  templateId,
  onUploaded,
}: {
  templateId: string;
  onUploaded: () => void;
}) {
  const [fieldMappings, setFieldMappings] = useState<UploadTemplateVersionFieldMapping[]>([
    { fieldKey: "", label: "", fieldType: "STRING", required: false },
  ]);
  const [allowPartialGeneration, setAllowPartialGeneration] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(undefined);
    const validRows = fieldMappings.filter((row) => row.fieldKey.trim() && row.label.trim());
    const result = await uploadDocumentTemplateVersionAction(
      templateId,
      validRows,
      allowPartialGeneration,
      INITIAL_STATE,
      formData,
    );
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onUploaded();
  }

  return (
    <form
      action={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-tenderos-navy/15 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FileInput name="file" accept=".docx" required aria-label="Modèle Word (.docx)" />
        <Checkbox
          label="Autoriser la génération partielle si un champ requis manque"
          checked={allowPartialGeneration}
          onChange={(e) => setAllowPartialGeneration(e.target.checked)}
        />
      </div>
      <FieldMappingEditor rows={fieldMappings} onChange={setFieldMappings} />
      <Button type="submit" variant="primary" disabled={isPending} className="self-start">
        {isPending ? "Envoi..." : "Envoyer la nouvelle version"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TemplateRow({
  template,
  canManage,
}: {
  template: DocumentTemplateSummary;
  canManage: boolean;
}) {
  const [detail, setDetail] = useState<DocumentTemplateDetail | undefined>();
  const [expanded, setExpanded] = useState(false);
  const [activating, setActivating] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function loadDetail() {
    try {
      setDetail(await fetchDocumentTemplate(template.id));
    } catch {
      setError("Impossible de charger le détail du template.");
    }
  }

  async function toggle() {
    if (!expanded && !detail) await loadDetail();
    setExpanded((v) => !v);
  }

  async function handleActivate(versionId: string) {
    setActivating(versionId);
    const result = await activateDocumentTemplateVersionAction(template.id, versionId);
    setActivating(undefined);
    if (result.error) setError(result.error);
    else await loadDetail();
  }

  return (
    <Card padding="tight">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button type="button" variant="link" onClick={toggle} className="text-sm">
            {template.name}
          </Button>
          <span className="ml-2 text-xs text-tenderos-slate">
            {template.scope === "SYSTEM" ? "Système" : "Organisation"}
          </span>
        </div>
        <span className="text-xs text-tenderos-slate">
          {template.activeVersion
            ? `v${template.activeVersion.version} active`
            : "Aucune version active"}
        </span>
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-tenderos-navy/10 pt-3">
          {error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {error}
            </p>
          ) : null}

          {detail ? (
            <div className="flex flex-col gap-2">
              {detail.versions.length === 0 ? (
                <p className="text-xs text-tenderos-slate">
                  Aucune version envoyée pour l&apos;instant.
                </p>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Version</TableHeaderCell>
                      <TableHeaderCell>Statut</TableHeaderCell>
                      <TableHeaderCell>Placeholders détectés</TableHeaderCell>
                      <TableHeaderCell>Champs mappés</TableHeaderCell>
                      <TableHeaderCell>{null}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.versions.map((version) => (
                      <TableRow key={version.id}>
                        <TableCell>v{version.version}</TableCell>
                        <TableCell className="text-tenderos-slate">
                          {VERSION_STATUS_LABELS[version.status] ?? version.status}
                        </TableCell>
                        <TableCell className="text-tenderos-slate">{version.discoveredPlaceholders.length}</TableCell>
                        <TableCell className="text-tenderos-slate">{version.fieldMappings.length}</TableCell>
                        <TableCell>
                          {canManage && version.status === "DRAFT" ? (
                            <Button
                              type="button"
                              variant="link"
                              disabled={activating === version.id}
                              onClick={() => handleActivate(version.id)}
                            >
                              {activating === version.id ? "Activation..." : "Activer"}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}

          {canManage ? (
            <UploadVersionForm templateId={template.id} onUploaded={loadDetail} />
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function DocumentTemplatesSection({
  initialTemplates,
  actorRole,
}: {
  initialTemplates: DocumentTemplateSummary[];
  actorRole: string | undefined;
}) {
  const canManage = canManageDocumentTemplates(actorRole);

  return (
    <div className="flex flex-col gap-4">
      {canManage ? <CreateTemplateForm /> : null}

      {initialTemplates.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucun template documentaire pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {initialTemplates.map((template) => (
            <TemplateRow key={template.id} template={template} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
