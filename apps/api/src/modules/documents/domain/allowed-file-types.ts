/**
 * Configuration centralisée des formats autorisés (mission §10) — ni l'extension, ni le type
 * MIME déclaré par le navigateur ne font foi seuls : une combinaison doit correspondre à une
 * entrée connue de cette liste pour être acceptée (cohérence MIME/extension).
 */
export type AllowedFileType = Readonly<{ mimeType: string; extensions: readonly string[] }>;

export const ALLOWED_FILE_TYPES: readonly AllowedFileType[] = [
  { mimeType: "application/pdf", extensions: ["pdf"] },
  { mimeType: "application/msword", extensions: ["doc"] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
  },
  { mimeType: "application/vnd.ms-excel", extensions: ["xls"] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
  },
  { mimeType: "text/csv", extensions: ["csv"] },
  { mimeType: "text/plain", extensions: ["txt"] },
  { mimeType: "image/png", extensions: ["png"] },
  { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
];

export function isAllowedFileType(mimeType: string, extension: string): boolean {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  return ALLOWED_FILE_TYPES.some(
    (entry) => entry.mimeType === mimeType && entry.extensions.includes(normalizedExtension),
  );
}
