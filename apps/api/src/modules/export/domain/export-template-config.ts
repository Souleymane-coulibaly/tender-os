import { InvalidExportTemplateConfigError } from "./errors";

export type ExportTemplateSectionConfig = Readonly<{
  id: string;
  label: string;
  mandatory: boolean;
  order: number;
}>;

export type ExportTemplateConfig = Readonly<{
  sections: readonly ExportTemplateSectionConfig[];
  coverPage: Readonly<{
    showBuyerName: boolean;
    showClientName: boolean;
    showReference: boolean;
    showTitle: boolean;
    showDate: boolean;
    showVersion: boolean;
  }>;
  headerText?: string | undefined;
  footerText?: string | undefined;
  showPageNumbers: boolean;
  showTableOfContents: boolean;
  allowedVariables: readonly string[];
}>;

const MAX_SECTIONS = 100;
const MAX_TEXT_LENGTH = 500;

/**
 * Mission Sprint 8A §16/§18 — structure CONTRÔLÉE par le domaine à la création, jamais une
 * exécution de template arbitraire ("aucune macro, aucune injection de template, aucun chemin
 * exécutable"). Validé une fois pour toutes ici ; `config` d'une version ACTIVE ne change plus
 * jamais ensuite (mission "une version active est immuable").
 */
export function validateExportTemplateConfig(input: unknown): ExportTemplateConfig {
  if (typeof input !== "object" || input === null) {
    throw new InvalidExportTemplateConfigError("config must be an object");
  }
  const raw = input as Record<string, unknown>;

  const sectionsInput = raw.sections;
  if (!Array.isArray(sectionsInput) || sectionsInput.length === 0) {
    throw new InvalidExportTemplateConfigError("config.sections must be a non-empty array");
  }
  if (sectionsInput.length > MAX_SECTIONS) {
    throw new InvalidExportTemplateConfigError(`config.sections must not exceed ${MAX_SECTIONS} entries`);
  }

  const seenIds = new Set<string>();
  const sections: ExportTemplateSectionConfig[] = sectionsInput.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new InvalidExportTemplateConfigError(`config.sections[${index}] must be an object`);
    }
    const section = entry as Record<string, unknown>;
    if (typeof section.id !== "string" || !/^[A-Z0-9_]{1,80}$/.test(section.id)) {
      throw new InvalidExportTemplateConfigError(`config.sections[${index}].id must be an uppercase identifier (letters, digits, underscore)`);
    }
    if (seenIds.has(section.id)) {
      throw new InvalidExportTemplateConfigError(`duplicate section id "${section.id}"`);
    }
    seenIds.add(section.id);
    if (typeof section.label !== "string" || section.label.trim().length === 0 || section.label.length > MAX_TEXT_LENGTH) {
      throw new InvalidExportTemplateConfigError(`config.sections[${index}].label is invalid`);
    }
    if (typeof section.mandatory !== "boolean") {
      throw new InvalidExportTemplateConfigError(`config.sections[${index}].mandatory must be a boolean`);
    }
    if (typeof section.order !== "number" || !Number.isInteger(section.order) || section.order < 0) {
      throw new InvalidExportTemplateConfigError(`config.sections[${index}].order must be a non-negative integer`);
    }
    return { id: section.id, label: section.label, mandatory: section.mandatory, order: section.order };
  });

  const coverPageInput = (raw.coverPage as Record<string, unknown> | undefined) ?? {};
  const coverPage = {
    showBuyerName: coverPageInput.showBuyerName !== false,
    showClientName: coverPageInput.showClientName !== false,
    showReference: coverPageInput.showReference !== false,
    showTitle: coverPageInput.showTitle !== false,
    showDate: coverPageInput.showDate !== false,
    showVersion: coverPageInput.showVersion !== false,
  };

  if (raw.headerText !== undefined && (typeof raw.headerText !== "string" || raw.headerText.length > MAX_TEXT_LENGTH)) {
    throw new InvalidExportTemplateConfigError("config.headerText is invalid");
  }
  if (raw.footerText !== undefined && (typeof raw.footerText !== "string" || raw.footerText.length > MAX_TEXT_LENGTH)) {
    throw new InvalidExportTemplateConfigError("config.footerText is invalid");
  }

  const allowedVariablesInput = raw.allowedVariables;
  let allowedVariables: readonly string[] = [];
  if (allowedVariablesInput !== undefined) {
    if (!Array.isArray(allowedVariablesInput) || !allowedVariablesInput.every((v) => typeof v === "string")) {
      throw new InvalidExportTemplateConfigError("config.allowedVariables must be an array of strings");
    }
    allowedVariables = allowedVariablesInput;
  }

  return {
    sections,
    coverPage,
    headerText: raw.headerText as string | undefined,
    footerText: raw.footerText as string | undefined,
    showPageNumbers: raw.showPageNumbers !== false,
    showTableOfContents: raw.showTableOfContents !== false,
    allowedVariables,
  };
}
