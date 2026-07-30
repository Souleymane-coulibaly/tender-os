import type { KnowledgeCategory } from "../../../../lib/knowledge-types";

/**
 * Champs de métadonnées structurées par catégorie (mission Sprint 5 §"métadonnées métier") —
 * volontairement borné aux 3 catégories documentées avec un schéma dédié côté backend
 * (client-reference/consultant-profile/certification.schema.ts) ; jamais un moteur de
 * formulaire dynamique générique. Les autres catégories n'affichent aucun champ additionnel.
 */
export function KnowledgeMetadataFields({
  category,
  defaultValues = {},
}: {
  category: KnowledgeCategory;
  defaultValues?: Record<string, unknown>;
}) {
  function value(field: string): string | undefined {
    const raw = defaultValues[field];
    if (raw === undefined || raw === null) return undefined;
    if (Array.isArray(raw)) return raw.join(", ");
    if (typeof raw === "string" && (field.endsWith("Date"))) return raw.slice(0, 10);
    return String(raw);
  }

  if (category === "CLIENT_REFERENCE") {
    return (
      <fieldset className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <legend className="px-1 text-xs font-semibold text-neutral-600">Détails de la référence client</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="metadata.clientName" label="Nom du client" defaultValue={value("clientName")} />
          <Field id="metadata.sector" label="Secteur" defaultValue={value("sector")} />
          <Field id="metadata.startDate" label="Date de début" type="date" defaultValue={value("startDate")} />
          <Field id="metadata.endDate" label="Date de fin" type="date" defaultValue={value("endDate")} />
          <Field id="metadata.amount" label="Montant" type="number" defaultValue={value("amount")} />
          <Field id="metadata.currency" label="Devise (ex. EUR)" defaultValue={value("currency")} />
          <Field id="metadata.location" label="Lieu" defaultValue={value("location")} />
          <Field id="metadata.technologies" label="Technologies (séparées par virgule)" defaultValue={value("technologies")} />
        </div>
      </fieldset>
    );
  }

  if (category === "CONSULTANT_PROFILE") {
    return (
      <fieldset className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <legend className="px-1 text-xs font-semibold text-neutral-600">Profil du consultant</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="metadata.fullName" label="Nom complet" defaultValue={value("fullName")} />
          <Field id="metadata.role" label="Rôle" defaultValue={value("role")} />
          <Field id="metadata.yearsOfExperience" label="Années d'expérience" type="number" defaultValue={value("yearsOfExperience")} />
          <Field id="metadata.availability" label="Disponibilité" defaultValue={value("availability")} />
          <Field id="metadata.skills" label="Compétences (séparées par virgule)" defaultValue={value("skills")} />
          <Field id="metadata.certifications" label="Certifications (séparées par virgule)" defaultValue={value("certifications")} />
          <Field id="metadata.languages" label="Langues (séparées par virgule)" defaultValue={value("languages")} />
        </div>
      </fieldset>
    );
  }

  if (category === "CERTIFICATION") {
    return (
      <fieldset className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <legend className="px-1 text-xs font-semibold text-neutral-600">Détails de la certification</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="metadata.name" label="Nom" defaultValue={value("name")} />
          <Field id="metadata.issuer" label="Organisme émetteur" defaultValue={value("issuer")} />
          <Field id="metadata.issueDate" label="Date d'émission" type="date" defaultValue={value("issueDate")} />
          <Field id="metadata.expiryDate" label="Date d'expiration" type="date" defaultValue={value("expiryDate")} />
          <Field id="metadata.certificateNumber" label="Numéro de certificat" defaultValue={value("certificateNumber")} />
        </div>
      </fieldset>
    );
  }

  return null;
}

function Field({
  id,
  label,
  type = "text",
  defaultValue,
}: {
  id: string;
  label: string;
  type?: string;
  defaultValue?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-neutral-600">
        {label}
      </label>
      <input id={id} name={id} type={type} defaultValue={defaultValue} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
    </div>
  );
}
