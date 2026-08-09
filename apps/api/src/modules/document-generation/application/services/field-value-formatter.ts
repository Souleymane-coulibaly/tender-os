import { FieldType, type FieldType as FieldTypeUnion } from "../../domain/field-type";
import type { DocumentTemplateFieldMapping } from "../../domain/document-template-field-mapping";

/** Symboles Unicode contrôlés (mission "support des cases à cocher SANS remplacement naïf par
 *  'X'") — jamais une lettre ASCII substituée dans le texte, toujours ces deux glyphes dédiés. */
const CHECKBOX_CHECKED = "☒";
const CHECKBOX_UNCHECKED = "☐";

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true" || value.trim() === "1" || value.trim().toLowerCase() === "oui";
  return Boolean(value);
}

function asNumber(value: unknown, fieldKey: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Field "${fieldKey}" expects a numeric value, got: ${String(value)}`);
  }
  return numeric;
}

function asDate(value: unknown, fieldKey: string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Field "${fieldKey}" expects a valid date, got: ${String(value)}`);
  }
  return parsed;
}

/**
 * Transformation déclarative, CENTRALISÉE, d'une valeur brute vers la forme finale injectée dans le
 * document (mission "transformations déclaratives... formatage centralisé date/devise"). Le
 * domaine/l'application ne décident jamais de la provenance de `rawValue` (fournie par l'appelant
 * via le `dataSnapshot`) — uniquement de sa MISE EN FORME, selon `mapping.fieldType`.
 *
 * `LIST`/`TABLE` passent la valeur BRUTE (tableau) sans transformation — c'est le moteur de fusion
 * (boucle docxtemplater `{#field}...{/field}`) qui consomme un tableau, jamais une chaîne formatée.
 * Toutes les autres transformations produisent une chaîne, jamais un objet — évite par construction
 * toute injection XML/HTML (même discipline que l'IR `RenderableBlock` du module Export).
 */
export function formatFieldValue(mapping: DocumentTemplateFieldMapping, rawValue: unknown): unknown {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  const options = mapping.formatOptions ?? {};

  switch (mapping.fieldType as FieldTypeUnion) {
    case FieldType.String:
      return String(rawValue);

    case FieldType.Multiline:
      // `linebreaks: true` (moteur de fusion) convertit les `\n` en sauts de ligne Word réels —
      // jamais un seul paragraphe compressé (mission "aucune troncature silencieuse de texte long").
      return String(rawValue);

    case FieldType.Date: {
      const date = asDate(rawValue, mapping.fieldKey);
      const locale = typeof options.locale === "string" ? options.locale : "fr-FR";
      return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    }

    case FieldType.Currency: {
      const amount = asNumber(rawValue, mapping.fieldKey);
      const currency = typeof options.currency === "string" ? options.currency : "EUR";
      const locale = typeof options.locale === "string" ? options.locale : "fr-FR";
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    }

    case FieldType.Percentage: {
      const ratio = asNumber(rawValue, mapping.fieldKey);
      const decimals = typeof options.decimals === "number" ? options.decimals : 1;
      const locale = typeof options.locale === "string" ? options.locale : "fr-FR";
      return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(ratio);
    }

    case FieldType.Boolean: {
      const flag = asBoolean(rawValue);
      const trueLabel = typeof options.trueLabel === "string" ? options.trueLabel : "Oui";
      const falseLabel = typeof options.falseLabel === "string" ? options.falseLabel : "Non";
      return flag ? trueLabel : falseLabel;
    }

    case FieldType.Checkbox:
      return asBoolean(rawValue) ? CHECKBOX_CHECKED : CHECKBOX_UNCHECKED;

    case FieldType.List:
    case FieldType.Table:
      return rawValue;

    default:
      return String(rawValue);
  }
}

/** Applique `formatFieldValue` à l'ensemble du snapshot, en s'appuyant sur la Field Mapping pour
 *  connaître le type de chaque champ — un champ présent dans le snapshot mais absent de la Field
 *  Mapping est ignoré ici (jamais injecté dans le document sans transformation contrôlée). */
export function formatDataSnapshot(mappings: readonly DocumentTemplateFieldMapping[], snapshot: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const mapping of mappings) {
    const formatted = formatFieldValue(mapping, snapshot[mapping.fieldKey]);
    if (formatted !== undefined) {
      result[mapping.fieldKey] = formatted;
    }
  }
  return result;
}
