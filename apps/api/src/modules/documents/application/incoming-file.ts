import { computeChecksum } from "./checksum";
import { isAllowedFileType } from "../domain/allowed-file-types";
import { EmptyFileError, FileTooLargeError, UnsupportedFileTypeError } from "../domain/errors";
import { extractExtension, sanitizeFilename } from "../domain/filename-sanitizer";

export type IncomingFile = Readonly<{
  buffer: Buffer;
  originalFilename: string;
  /** Type MIME déclaré par le client (Multer) — jamais fait confiance seul, toujours recroisé
   *  avec l'extension via `isAllowedFileType` (mission §10). */
  mimeType: string;
}>;

export type ValidatedIncomingFile = Readonly<{
  sanitizedFilename: string;
  extension: string;
  checksum: string;
  sizeBytes: number;
}>;

/**
 * Validation centralisée d'un fichier entrant, partagée par CreateDocumentWithFirstVersion et
 * AddDocumentVersion — ni l'extension, ni le type MIME, ni le nom de fichier ne sont fiables
 * individuellement (mission §10).
 */
export function validateIncomingFile(file: IncomingFile, maxSizeBytes: number): ValidatedIncomingFile {
  if (file.buffer.length === 0) {
    throw new EmptyFileError();
  }
  if (file.buffer.length > maxSizeBytes) {
    throw new FileTooLargeError({ maxSizeBytes });
  }

  const sanitizedFilename = sanitizeFilename(file.originalFilename);
  const extension = extractExtension(sanitizedFilename);

  if (!isAllowedFileType(file.mimeType, extension)) {
    throw new UnsupportedFileTypeError({ mimeType: file.mimeType, extension });
  }

  return {
    sanitizedFilename,
    extension,
    checksum: computeChecksum(file.buffer),
    sizeBytes: file.buffer.length,
  };
}
