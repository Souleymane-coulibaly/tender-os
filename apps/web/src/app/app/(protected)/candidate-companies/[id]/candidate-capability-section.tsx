"use client";

import { useActionState } from "react";
import { Badge, Button, EmptyState } from "../../../../../components/ui";
import {
  formatOptionalDate,
  isArchived,
  REPRESENTATIVE_TYPE_LABELS,
  TEMPORAL_STATUS_LABELS,
  TEMPORAL_STATUS_TONE,
  type CandidateCertification,
  type CandidateHumanResource,
  type CandidateInsurance,
  type CandidateMaterialResource,
  type CandidateReference,
  type CandidateRepresentative,
  type TemporalValidityStatus,
} from "../../../../../lib/candidate-capability-types";
import { archiveCandidateCapabilityAction, createCandidateCapabilityAction, type CapabilityActionState } from "../../../candidate-capability-actions";

const INITIAL_STATE: CapabilityActionState = {};

export type CapabilityFamily = "representatives" | "insurances" | "certifications" | "references" | "human-resources" | "material-resources";

type FieldDescriptor = Readonly<{ name: string; label: string; required?: boolean; type?: "text" | "date" | "number"; options?: readonly { value: string; label: string }[] }>;

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — section générique de capacité candidate.
 *
 * Les six familles partagent EXACTEMENT le même cycle de vie (lister, ajouter, archiver) et la même
 * garde (`candidate:capability_edit`). Écrire six composants quasi identiques les ferait diverger au
 * premier correctif ; la structure MÉTIER, elle, reste distincte — chaque famille garde ses propres
 * colonnes et ses propres champs, décrits ci-dessous et jamais fusionnés.
 *
 * L'écriture passe uniquement par les routes CandidateCompany : aucun appel `/clients/:id/*`,
 * aucune lecture complémentaire de `CompanyProfile`.
 */
export const CAPABILITY_FORM_FIELDS: Readonly<Record<CapabilityFamily, readonly FieldDescriptor[]>> = {
  representatives: [
    { name: "firstName", label: "Prénom", required: true },
    { name: "lastName", label: "Nom", required: true },
    {
      name: "type",
      label: "Rôle",
      required: true,
      options: Object.entries(REPRESENTATIVE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    },
    { name: "jobTitle", label: "Fonction" },
    { name: "email", label: "Courriel" },
    { name: "phone", label: "Téléphone" },
  ],
  insurances: [
    {
      name: "type",
      label: "Type",
      required: true,
      options: [
        { value: "PROFESSIONAL_LIABILITY", label: "Responsabilité civile professionnelle" },
        { value: "DECENNIAL", label: "Décennale" },
        { value: "OPERATING_LIABILITY", label: "Responsabilité civile exploitation" },
        { value: "SECTOR_SPECIFIC", label: "Sectorielle" },
        { value: "OTHER", label: "Autre" },
      ],
    },
    { name: "insurer", label: "Assureur" },
    { name: "policyNumber", label: "N° de police" },
    { name: "expiresAt", label: "Échéance", type: "date" },
  ],
  certifications: [
    { name: "name", label: "Nom", required: true },
    { name: "issuer", label: "Organisme" },
    { name: "number", label: "Référence" },
    { name: "obtainedAt", label: "Obtenue le", type: "date" },
    { name: "expiresAt", label: "Échéance", type: "date" },
  ],
  references: [
    { name: "projectName", label: "Projet", required: true },
    { name: "referenceClientName", label: "Client" },
    { name: "sector", label: "Secteur" },
    { name: "description", label: "Description" },
  ],
  "human-resources": [
    { name: "category", label: "Catégorie", required: true },
    { name: "title", label: "Intitulé", required: true },
    { name: "headcount", label: "Effectif", type: "number" },
    { name: "qualification", label: "Qualification" },
  ],
  "material-resources": [
    { name: "category", label: "Catégorie", required: true },
    { name: "name", label: "Désignation", required: true },
    { name: "quantity", label: "Quantité", type: "number" },
    { name: "description", label: "Description" },
  ],
};

export type CapabilityRow = Readonly<{
  id: string;
  status: string;
  cells: readonly { label: string; value: string }[];
  /** Présent uniquement pour les familles à échéance — jamais recalculé ici. */
  temporalStatus?: TemporalValidityStatus | undefined;
}>;

export function toRepresentativeRows(items: CandidateRepresentative[]): CapabilityRow[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    cells: [
      { label: "Nom", value: `${item.firstName} ${item.lastName}`.trim() },
      { label: "Rôle", value: REPRESENTATIVE_TYPE_LABELS[item.type] ?? item.type },
      { label: "Fonction", value: item.jobTitle ?? "Non renseigné" },
      { label: "Courriel", value: item.email ?? "Non renseigné" },
      { label: "Téléphone", value: item.phone ?? "Non renseigné" },
    ],
  }));
}

export function toCertificationRows(items: (CandidateCertification & { temporalStatus?: TemporalValidityStatus })[]): CapabilityRow[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    temporalStatus: item.temporalStatus,
    cells: [
      { label: "Nom", value: item.name },
      { label: "Organisme", value: item.issuer ?? "Non renseigné" },
      { label: "Référence", value: item.number ?? "Non renseigné" },
      { label: "Échéance", value: formatOptionalDate(item.expiresAt) },
    ],
  }));
}

export function toInsuranceRows(items: (CandidateInsurance & { temporalStatus?: TemporalValidityStatus })[]): CapabilityRow[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    temporalStatus: item.temporalStatus,
    cells: [
      { label: "Type", value: item.otherTypeLabel ?? item.type },
      { label: "Assureur", value: item.insurer ?? "Non renseigné" },
      { label: "N° de police", value: item.policyNumber ?? "Non renseigné" },
      { label: "Échéance", value: formatOptionalDate(item.expiresAt) },
    ],
  }));
}

export function toReferenceRows(items: CandidateReference[]): CapabilityRow[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    cells: [
      { label: "Projet", value: item.projectName },
      { label: "Client", value: item.referenceClientName ?? "Non renseigné" },
      { label: "Secteur", value: item.sector ?? "Non renseigné" },
      { label: "Confidentialité", value: item.confidentiality === "CONFIDENTIAL" ? "Confidentielle" : "Standard" },
    ],
  }));
}

export function toHumanResourceRows(items: CandidateHumanResource[]): CapabilityRow[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    cells: [
      { label: "Catégorie", value: item.category },
      { label: "Intitulé", value: item.title },
      { label: "Effectif", value: String(item.headcount) },
      { label: "Qualification", value: item.qualification ?? "Non renseigné" },
    ],
  }));
}

export function toMaterialResourceRows(items: CandidateMaterialResource[]): CapabilityRow[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    cells: [
      { label: "Catégorie", value: item.category },
      { label: "Désignation", value: item.name },
      { label: "Quantité", value: String(item.quantity) },
      { label: "Disponibilité", value: item.availabilityStatus },
    ],
  }));
}

export function CandidateCapabilitySection({
  candidateCompanyId,
  family,
  rows,
  emptyLabel,
  addLabel,
  canEdit,
}: {
  candidateCompanyId: string;
  family: CapabilityFamily;
  rows: CapabilityRow[];
  emptyLabel: string;
  addLabel: string;
  canEdit: boolean;
}) {
  const boundAction = createCandidateCapabilityAction.bind(null, candidateCompanyId, family);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const fields = CAPABILITY_FORM_FIELDS[family];
  const headers = rows[0]?.cells.map((cell) => cell.label) ?? fields.filter((field) => field.required).map((field) => field.label);

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <EmptyState
          title={emptyLabel}
          description={canEdit ? "Ajoutez un premier élément ci-dessous." : "Vous n'avez pas les droits nécessaires pour en ajouter."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-mist text-left text-tenderos-slate">
                {headers.map((header) => (
                  <th key={header} scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                    {header}
                  </th>
                ))}
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  État
                </th>
                {canEdit ? <th scope="col" className="py-2 text-right text-xs font-semibold uppercase">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={`border-b border-tenderos-mist/60 ${isArchived(row.status) ? "opacity-60" : ""}`}>
                  {row.cells.map((cell) => (
                    <td key={cell.label} className="py-2 pr-4 text-tenderos-navy">
                      {cell.value}
                    </td>
                  ))}
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-1">
                      {isArchived(row.status) ? <Badge tone="neutral">Archivée</Badge> : null}
                      {row.temporalStatus ? (
                        <Badge tone={TEMPORAL_STATUS_TONE[row.temporalStatus]}>{TEMPORAL_STATUS_LABELS[row.temporalStatus]}</Badge>
                      ) : null}
                    </div>
                  </td>
                  {canEdit ? (
                    <td className="py-2 text-right">
                      {isArchived(row.status) ? null : (
                        <form
                          action={async () => {
                            await archiveCandidateCapabilityAction(candidateCompanyId, family, row.id);
                          }}
                        >
                          <Button type="submit" variant="ghost" size="sm">
                            Archiver
                          </Button>
                        </form>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-tenderos-mist p-4">
          <h3 className="text-sm font-semibold text-tenderos-navy">{addLabel}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => {
              const inputId = `${family}-${field.name}`;
              return (
                <div key={field.name} className="flex flex-col gap-1">
                  <label htmlFor={inputId} className="text-xs font-medium text-tenderos-slate">
                    {field.label}
                    {field.required ? " *" : ""}
                  </label>
                  {field.options ? (
                    <select id={inputId} name={field.name} required={field.required} className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy">
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={inputId}
                      name={field.name}
                      type={field.type ?? "text"}
                      required={field.required}
                      className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
                    />
                  )}
                </div>
              );
            })}
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Enregistrement…" : addLabel}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
