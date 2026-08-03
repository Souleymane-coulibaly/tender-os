/**
 * État d'un import ZIP asynchrone (mission Sprint 8A.2, correction bug #3 "import ZIP lourd échoue
 * ou bloque") — CREATED dès la validation de l'upload (avant tout traitement), EXTRACTING pendant
 * l'inspection/décompression de l'archive (déjà sûre, voir YauzlArchiveInspector), IMPORTING
 * pendant le traitement fichier-par-fichier (déjà existant, voir ImportDceFilesUseCase), puis un
 * état terminal. PARTIALLY_READY reflète un import dont au moins un fichier a été rejeté (format,
 * doublon...) sans que ce soit un échec global — jamais confondu avec FAILED (erreur inattendue
 * ayant interrompu le traitement lui-même, ex. sécurité ZIP violée).
 */
export const DceImportJobStatus = {
  Created: "CREATED",
  Extracting: "EXTRACTING",
  Importing: "IMPORTING",
  Ready: "READY",
  PartiallyReady: "PARTIALLY_READY",
  Failed: "FAILED",
  Cancelled: "CANCELLED",
} as const;

export type DceImportJobStatus = (typeof DceImportJobStatus)[keyof typeof DceImportJobStatus];

export function isDceImportJobStatus(value: string): value is DceImportJobStatus {
  return Object.values(DceImportJobStatus).includes(value as DceImportJobStatus);
}

const TERMINAL_STATUSES = new Set<DceImportJobStatus>([
  DceImportJobStatus.Ready,
  DceImportJobStatus.PartiallyReady,
  DceImportJobStatus.Failed,
  DceImportJobStatus.Cancelled,
]);

export function isTerminalDceImportJobStatus(status: DceImportJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const ALLOWED_TRANSITIONS: Record<DceImportJobStatus, readonly DceImportJobStatus[]> = {
  [DceImportJobStatus.Created]: [DceImportJobStatus.Extracting, DceImportJobStatus.Failed, DceImportJobStatus.Cancelled],
  [DceImportJobStatus.Extracting]: [DceImportJobStatus.Importing, DceImportJobStatus.Failed, DceImportJobStatus.Cancelled],
  [DceImportJobStatus.Importing]: [
    DceImportJobStatus.Ready,
    DceImportJobStatus.PartiallyReady,
    DceImportJobStatus.Failed,
    DceImportJobStatus.Cancelled,
  ],
  [DceImportJobStatus.Ready]: [],
  [DceImportJobStatus.PartiallyReady]: [],
  [DceImportJobStatus.Failed]: [],
  [DceImportJobStatus.Cancelled]: [],
};

export function isAllowedDceImportJobTransition(from: DceImportJobStatus, to: DceImportJobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
