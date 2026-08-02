export const ExportFormat = {
  Docx: "DOCX",
  Pdf: "PDF",
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export function isExportFormat(value: string): value is ExportFormat {
  return value === ExportFormat.Docx || value === ExportFormat.Pdf;
}
