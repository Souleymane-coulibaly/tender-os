import type { CandidateDocumentView } from "../../application/use-cases/candidate-document.use-cases";
import { computeTemporalValidityStatus } from "../../domain/enums";

/**
 * Checkpoint TENDEROS-2.1-CCV2-D — présentation d'une pièce de l'entreprise candidate.
 *
 * Le statut temporel est TOUJOURS recalculé ici depuis `validUntil` : il n'est jamais persisté et
 * ne peut donc pas devenir faux avec le temps. La date courante ne modifie jamais la ligne — elle
 * ne fait que teinter la lecture.
 *
 * Aucune donnée de stockage n'est exposée : ni `storageKey`, ni checksum, ni chemin — ce sont des
 * détails du moteur documentaire, disponibles (pour ce qui doit l'être) via les routes `/documents`.
 */
export function presentCandidateDocument(view: Pick<CandidateDocumentView, "association"> & { temporalStatus?: string }): Record<string, unknown> {
  const { association } = view;
  return {
    documentId: association.documentId,
    candidateCompanyId: association.candidateCompanyId,
    category: association.category,
    label: association.label,
    issuedAt: association.issuedAt,
    validFrom: association.validFrom,
    validUntil: association.validUntil,
    temporalStatus: computeTemporalValidityStatus(association.validUntil, new Date()),
    createdAt: association.createdAt,
  };
}
