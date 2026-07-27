import { computeChecksum } from "./checksum";
import { isAllowedDceFileType } from "../domain/allowed-file-types";
import { EmptyFileError, FileTooLargeError, UnsupportedFileTypeError } from "../domain/errors";
import { extractExtension, sanitizeFilename } from "../domain/filename-sanitizer";

export type IncomingDceFile = Readonly<{
  buffer: Buffer;
  originalFilename: string;
  /** Type MIME déclaré par le client — jamais fait confiance seul (mission §"contrôles
   *  fichiers"), toujours recroisé avec l'extension et, quand disponible, la signature réelle. */
  mimeType: string;
}>;

export type ValidatedIncomingDceFile = Readonly<{
  sanitizedFilename: string;
  extension: string;
  checksum: string;
  sizeBytes: number;
}>;

/**
 * Validation centralisée d'un fichier DCE entrant (import unique, import multiple, entrée de
 * ZIP) — même structure que `documents/application/incoming-file.ts`, adaptée à la liste de
 * formats propre au DCE.
 */
export function validateIncomingDceFile(file: IncomingDceFile, maxSizeBytes: number): ValidatedIncomingDceFile {
  if (file.buffer.length === 0) {
    throw new EmptyFileError();
  }
  if (file.buffer.length > maxSizeBytes) {
    throw new FileTooLargeError({ maxSizeBytes });
  }

  const sanitizedFilename = sanitizeFilename(file.originalFilename);
  const extension = extractExtension(sanitizedFilename);

  if (!isAllowedDceFileType(file.mimeType, extension)) {
    throw new UnsupportedFileTypeError({ filename: file.originalFilename });
  }

  return {
    sanitizedFilename,
    extension,
    checksum: computeChecksum(file.buffer),
    sizeBytes: file.buffer.length,
  };
}
