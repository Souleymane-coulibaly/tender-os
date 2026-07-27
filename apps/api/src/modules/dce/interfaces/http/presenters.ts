import type { DceDocumentSummary, DceSummary } from "../../application/dtos";
import type { ImportDceFilesResult } from "../../application/use-cases/import-dce-files.use-case";

// Passe-plat volontaire : DceSummary/DceDocumentSummary n'exposent déjà jamais storageKey ni
// aucune information de stockage (même règle que Documents, conception §M).
export function presentDce(dce: DceSummary): DceSummary {
  return { ...dce };
}

export function presentDceDocument(document: DceDocumentSummary): DceDocumentSummary {
  return { ...document };
}

export function presentImportResult(result: ImportDceFilesResult) {
  return { accepted: result.accepted.map(presentDceDocument), rejected: result.rejected };
}
