import { InvalidDeliverableTemplateConfigError } from "./errors";

export type DocumentThemeConfig = Readonly<{
  margins?: Readonly<{ top: number; right: number; bottom: number; left: number }> | undefined;
  coverPage?: Readonly<{ layout?: string | undefined; showLogo: boolean }> | undefined;
  headingStyles?: Readonly<{ h1?: string | undefined; h2?: string | undefined; h3?: string | undefined }> | undefined;
  paragraphStyle?: string | undefined;
  tableStyle?: string | undefined;
  headerText?: string | undefined;
  footerText?: string | undefined;
  showPageNumbers: boolean;
  contactDetails?: string | undefined;
  legalNotice?: string | undefined;
  /** Mission §6 "convention de nommage des fichiers" — ex. `{tenderRef}_{deliverableType}_v{version}`. */
  fileNamingConvention?: string | undefined;
}>;

const MAX_TEXT_LENGTH = 2000;
const MAX_MARGIN = 200;

/**
 * Mission Sprint 8A.1 §6 — identité documentaire de l'organisation : logo/couleurs/polices
 * (colonnes dédiées `logoStorageKey`/`accentColor`/`fontFamily`, hors de cette structure) plus
 * marges/page de garde/styles H1-H2-H3/tableaux/en-tête/pied de page/pagination/coordonnées/
 * mentions légales/convention de nommage (ce `config` Json). Validé une fois pour toutes à la
 * création — une version ACTIVE ne change plus jamais ensuite (mission "une version déjà utilisée
 * dans un export final est immuable" — satisfait structurellement : aucune méthode ne mute `config`
 * une fois `status = ACTIVE`, même discipline qu'`ExportTemplateVersion`).
 */
export function validateDocumentThemeConfig(input: unknown): DocumentThemeConfig {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  let margins: DocumentThemeConfig["margins"];
  if (raw.margins !== undefined) {
    if (typeof raw.margins !== "object" || raw.margins === null) {
      throw new InvalidDeliverableTemplateConfigError("config.margins must be an object");
    }
    const m = raw.margins as Record<string, unknown>;
    for (const key of ["top", "right", "bottom", "left"] as const) {
      if (typeof m[key] !== "number" || m[key] < 0 || (m[key] as number) > MAX_MARGIN) {
        throw new InvalidDeliverableTemplateConfigError(`config.margins.${key} must be between 0 and ${MAX_MARGIN}`);
      }
    }
    margins = { top: m.top as number, right: m.right as number, bottom: m.bottom as number, left: m.left as number };
  }

  let coverPage: DocumentThemeConfig["coverPage"];
  if (raw.coverPage !== undefined) {
    if (typeof raw.coverPage !== "object" || raw.coverPage === null) {
      throw new InvalidDeliverableTemplateConfigError("config.coverPage must be an object");
    }
    const c = raw.coverPage as Record<string, unknown>;
    coverPage = { layout: c.layout as string | undefined, showLogo: c.showLogo !== false };
  }

  let headingStyles: DocumentThemeConfig["headingStyles"];
  if (raw.headingStyles !== undefined) {
    if (typeof raw.headingStyles !== "object" || raw.headingStyles === null) {
      throw new InvalidDeliverableTemplateConfigError("config.headingStyles must be an object");
    }
    const h = raw.headingStyles as Record<string, unknown>;
    headingStyles = { h1: h.h1 as string | undefined, h2: h.h2 as string | undefined, h3: h.h3 as string | undefined };
  }

  for (const field of ["paragraphStyle", "tableStyle", "headerText", "footerText", "contactDetails", "legalNotice", "fileNamingConvention"] as const) {
    if (raw[field] !== undefined && (typeof raw[field] !== "string" || (raw[field] as string).length > MAX_TEXT_LENGTH)) {
      throw new InvalidDeliverableTemplateConfigError(`config.${field} is invalid`);
    }
  }

  return {
    margins,
    coverPage,
    headingStyles,
    paragraphStyle: raw.paragraphStyle as string | undefined,
    tableStyle: raw.tableStyle as string | undefined,
    headerText: raw.headerText as string | undefined,
    footerText: raw.footerText as string | undefined,
    showPageNumbers: raw.showPageNumbers !== false,
    contactDetails: raw.contactDetails as string | undefined,
    legalNotice: raw.legalNotice as string | undefined,
    fileNamingConvention: raw.fileNamingConvention as string | undefined,
  };
}
