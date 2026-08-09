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
import { canManageDocumentTemplates, FIELD_TYPE_LABELS, type DocumentTemplateDetail, type DocumentTemplateSummary, type FieldType } from "../../../../../lib/document-generation-types";

const INITIAL_STATE: FormActionState = {};
const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];

function CreateTemplateForm() {
  const [state, formAction, isPending] = useActionState(createDocumentTemplateAction, INITIAL_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-600">Nom</label>
        <input name="name" type="text" required placeholder="Modèle de mémoire technique..." className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-600">Portée</label>
        <select name="scope" defaultValue="ORGANIZATION" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="ORGANIZATION">Organisation</option>
          <option value="SYSTEM">Système</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-600">Description</label>
        <input name="description" type="text" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le template"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function FieldMappingEditor({ rows, onChange }: { rows: UploadTemplateVersionFieldMapping[]; onChange: (rows: UploadTemplateVersionFieldMapping[]) => void }) {
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
      <p className="text-xs text-neutral-600">
        Field Mapping — un placeholder doit correspondre EXACTEMENT à un tag présent dans le fichier (ex. <code className="rounded bg-neutral-100 px-1">tender.reference</code> pour{" "}
        <code className="rounded bg-neutral-100 px-1">{"{{tender.reference}}"}</code>).
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            placeholder="clé (ex. tender.reference)"
            value={row.fieldKey}
            onChange={(e) => updateRow(index, { fieldKey: e.target.value })}
            className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <input placeholder="Libellé" value={row.label} onChange={(e) => updateRow(index, { label: e.target.value })} className="w-40 rounded border border-neutral-300 px-2 py-1 text-sm" />
          <select value={row.fieldType} onChange={(e) => updateRow(index, { fieldType: e.target.value })} className="rounded border border-neutral-300 px-2 py-1 text-sm">
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-neutral-700">
            <input type="checkbox" checked={row.required} onChange={(e) => updateRow(index, { required: e.target.checked })} />
            Requis
          </label>
          <button type="button" onClick={() => removeRow(index)} className="text-xs text-red-700 hover:underline">
            Retirer
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="self-start text-xs text-neutral-700 hover:underline">
        + Ajouter un champ
      </button>
    </div>
  );
}

function UploadVersionForm({ templateId, onUploaded }: { templateId: string; onUploaded: () => void }) {
  const [fieldMappings, setFieldMappings] = useState<UploadTemplateVersionFieldMapping[]>([{ fieldKey: "", label: "", fieldType: "STRING", required: false }]);
  const [allowPartialGeneration, setAllowPartialGeneration] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(undefined);
    const validRows = fieldMappings.filter((row) => row.fieldKey.trim() && row.label.trim());
    const result = await uploadDocumentTemplateVersionAction(templateId, validRows, allowPartialGeneration, INITIAL_STATE, formData);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onUploaded();
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 rounded border border-dashed border-neutral-300 p-3">
      <div className="flex items-center gap-2">
        <input name="file" type="file" accept=".docx" required className="text-xs" />
        <label className="flex items-center gap-1 text-xs text-neutral-700">
          <input type="checkbox" checked={allowPartialGeneration} onChange={(e) => setAllowPartialGeneration(e.target.checked)} />
          Autoriser la génération partielle si un champ requis manque
        </label>
      </div>
      <FieldMappingEditor rows={fieldMappings} onChange={setFieldMappings} />
      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Envoi..." : "Envoyer la nouvelle version"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TemplateRow({ template, canManage }: { template: DocumentTemplateSummary; canManage: boolean }) {
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
    <div className="rounded border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={toggle} className="text-sm font-medium text-neutral-900 hover:underline">
            {template.name}
          </button>
          <span className="ml-2 text-xs text-neutral-500">{template.scope === "SYSTEM" ? "Système" : "Organisation"}</span>
        </div>
        <span className="text-xs text-neutral-600">{template.activeVersion ? `v${template.activeVersion.version} active` : "Aucune version active"}</span>
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3">
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}

          {detail ? (
            <div className="flex flex-col gap-2">
              {detail.versions.length === 0 ? (
                <p className="text-xs text-neutral-500">Aucune version envoyée pour l&apos;instant.</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="py-1 pr-4">Version</th>
                      <th className="py-1 pr-4">Statut</th>
                      <th className="py-1 pr-4">Placeholders détectés</th>
                      <th className="py-1 pr-4">Champs mappés</th>
                      <th className="py-1 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.versions.map((version) => (
                      <tr key={version.id} className="border-b border-neutral-100">
                        <td className="py-1 pr-4">v{version.version}</td>
                        <td className="py-1 pr-4">{version.status}</td>
                        <td className="py-1 pr-4">{version.discoveredPlaceholders.length}</td>
                        <td className="py-1 pr-4">{version.fieldMappings.length}</td>
                        <td className="py-1 pr-4">
                          {canManage && version.status === "DRAFT" ? (
                            <button type="button" disabled={activating === version.id} onClick={() => handleActivate(version.id)} className="text-neutral-900 hover:underline disabled:opacity-50">
                              {activating === version.id ? "Activation..." : "Activer"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {canManage ? <UploadVersionForm templateId={template.id} onUploaded={loadDetail} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function DocumentTemplatesSection({ initialTemplates, actorRole }: { initialTemplates: DocumentTemplateSummary[]; actorRole: string | undefined }) {
  const canManage = canManageDocumentTemplates(actorRole);

  return (
    <div className="flex flex-col gap-4">
      {canManage ? <CreateTemplateForm /> : null}

      {initialTemplates.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun template documentaire pour l&apos;instant.</p>
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
