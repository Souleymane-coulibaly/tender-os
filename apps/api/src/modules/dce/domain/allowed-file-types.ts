/**
 * Formats autorisés pour cette tranche du DCE (mission Sprint 1 §"formats acceptés") : PDF,
 * DOCX, XLSX, XLS, ZIP, PNG, JPEG — volontairement plus restreint que la liste déjà en place dans
 * Documents (qui inclut aussi DOC/CSV/TXT) : les deux modules possèdent chacun leur propre liste
 * plutôt que de partager celle de Documents, pour ne jamais élargir accidentellement les formats
 * du DCE le jour où Documents évoluerait. Ni l'extension, ni le MIME déclaré ne font foi seuls :
 * une combinaison doit correspondre à une entrée connue.
 */
export type AllowedDceFileType = Readonly<{ mimeType: string; extensions: readonly string[] }>;

export const ALLOWED_DCE_FILE_TYPES: readonly AllowedDceFileType[] = [
  { mimeType: "application/pdf", extensions: ["pdf"] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
  },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
  },
  { mimeType: "application/vnd.ms-excel", extensions: ["xls"] },
  { mimeType: "application/zip", extensions: ["zip"] },
  { mimeType: "application/x-zip-compressed", extensions: ["zip"] },
  { mimeType: "image/png", extensions: ["png"] },
  { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
];

export function isAllowedDceFileType(mimeType: string, extension: string): boolean {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  return ALLOWED_DCE_FILE_TYPES.some(
    (entry) => entry.mimeType === mimeType && entry.extensions.includes(normalizedExtension),
  );
}

/** Formats acceptés à l'intérieur d'une archive ZIP — jamais ZIP lui-même (pas d'archive
 *  imbriquée, mission §"sécurité ZIP obligatoire" : rejet des fichiers imbriqués dangereux). */
export function isAllowedDceZipEntryType(mimeType: string, extension: string): boolean {
  if (extension.toLowerCase().replace(/^\./, "") === "zip") {
    return false;
  }
  return isAllowedDceFileType(mimeType, extension);
}

/**
 * Recoupe la signature binaire détectée (quand disponible) avec l'extension déclarée — mission
 * §"contrôles fichiers" : "ne jamais faire confiance seul au nom, à l'extension ou au MIME
 * déclaré". ZIP/DOCX/XLSX partagent la même signature de conteneur (voir
 * `MagicByteFileSignatureDetector`), donc les trois extensions sont compatibles avec la
 * signature "application/zip". Une signature non détectée (`null`) reste inconclusive et n'est
 * jamais traitée comme un rejet ici — seule une signature positivement CONNUE mais en
 * contradiction avec l'extension déclarée doit faire rejeter le fichier.
 */
export function isSignatureCompatibleWithExtension(
  detectedMimeType: string | null,
  extension: string,
): boolean {
  if (detectedMimeType === null) {
    return true;
  }
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  switch (detectedMimeType) {
    case "application/pdf":
      return normalizedExtension === "pdf";
    case "application/zip":
      return ["zip", "docx", "xlsx"].includes(normalizedExtension);
    case "application/x-ole-compound":
      return normalizedExtension === "xls";
    case "image/png":
      return normalizedExtension === "png";
    case "image/jpeg":
      return ["jpg", "jpeg"].includes(normalizedExtension);
    default:
      return true;
  }
}
