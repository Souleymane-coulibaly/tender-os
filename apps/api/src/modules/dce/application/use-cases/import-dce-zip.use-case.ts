import { Inject, Injectable } from "@nestjs/common";
import { ALLOWED_DCE_FILE_TYPES } from "../../domain/allowed-file-types";
import { ZIP_ARCHIVE_INSPECTOR, type ZipArchiveInspector, type ZipImportLimits } from "../ports/zip-archive-inspector";
import { ImportDceFilesUseCase, type ImportDceFilesResult, type IncomingDceUpload } from "./import-dce-files.use-case";

export type ImportDceZipCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  zipBuffer: Buffer;
  maxFileSizeBytes: number;
  maxFilesPerImport: number;
  zipLimits: ZipImportLimits;
  requestId?: string | undefined;
}>;

/**
 * Une entrée ZIP n'a jamais de type MIME déclaré par un client HTTP (contrairement à un upload
 * multipart) — seule son extension est disponible. On l'infère depuis la liste des formats
 * autorisés du DCE ; une extension inconnue de cette liste produit un MIME inventé qui échouera
 * naturellement `isAllowedDceFileType` dans ImportDceFilesUseCase, ce qui est le comportement
 * désiré (rejet par-fichier, pas d'exception spéciale).
 */
function inferDeclaredMimeTypeFromExtension(extension: string): string {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  const match = ALLOWED_DCE_FILE_TYPES.find((entry) => entry.extensions.includes(normalized));
  return match?.mimeType ?? "application/octet-stream";
}

/**
 * Import d'une archive ZIP (mission Sprint 1 §"sécurité ZIP obligatoire") — délibérément un
 * simple adaptateur au-dessus d'ImportDceFilesUseCase plutôt qu'une réimplémentation : une fois
 * l'archive jugée structurellement sûre (voir ZipArchiveInspector — path traversal, chemin
 * absolu, lien symbolique, nombre d'entrées, taille totale, ratio de compression, tout rejette
 * l'archive ENTIÈRE), chaque entrée redevient un fichier ordinaire soumis exactement au même
 * traitement par-fichier que l'import direct (validation de format, signature binaire, détection
 * de doublon, délégation à Documents, journal d'audit) — y compris le rejet d'une entrée `.zip`
 * imbriquée, qui retombe naturellement sur le même rejet "utiliser l'import d'archive" déjà en
 * place dans ImportDceFilesUseCase (aucune archive imbriquée n'est donc jamais acceptée).
 */
@Injectable()
export class ImportDceZipUseCase {
  constructor(
    @Inject(ZIP_ARCHIVE_INSPECTOR) private readonly zipArchiveInspector: ZipArchiveInspector,
    private readonly importDceFilesUseCase: ImportDceFilesUseCase,
  ) {}

  async execute(command: ImportDceZipCommand): Promise<ImportDceFilesResult> {
    const entries = await this.zipArchiveInspector.extract({
      buffer: command.zipBuffer,
      limits: command.zipLimits,
    });

    const files: IncomingDceUpload[] = entries.map((entry) => {
      const extension = /\.([a-zA-Z0-9]+)$/.exec(entry.entryName)?.[1]?.toLowerCase() ?? "";
      return {
        buffer: entry.buffer,
        originalFilename: entry.entryName,
        mimeType: inferDeclaredMimeTypeFromExtension(extension),
      };
    });

    return this.importDceFilesUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      files,
      maxFileSizeBytes: command.maxFileSizeBytes,
      maxFilesPerImport: command.maxFilesPerImport,
      requestId: command.requestId,
    });
  }
}
