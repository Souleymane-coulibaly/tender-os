/**
 * Sprint 8C Phase 1 — mission §9 : dérivation PURE et DÉTERMINISTE de la checklist administrative à
 * partir des exigences CONFIRMÉES et de leur pièce/révision assortie. Conçue pour ne jamais être
 * redessinée par les phases suivantes (attestations avec cycle de validité, signature, groupement,
 * sous-traitants) : ces phases ajouteront des champs optionnels aux vues d'entrée ci-dessous, jamais
 * un nouveau contrôle de flux dans cette fonction. Le pourcentage de complétude exclut toujours les
 * lignes NON_APPLICABLE du dénominateur (mission §9 "ne doit pas compter les éléments non
 * applicables").
 */
export const AdministrativeChecklistLineState = {
  Manquant: "MANQUANT",
  ACompleter: "A_COMPLETER",
  AVerifier: "A_VERIFIER",
  Expire: "EXPIRE",
  NonApplicable: "NON_APPLICABLE",
  EnValidation: "EN_VALIDATION",
  Valide: "VALIDE",
  Pret: "PRET",
} as const;

export type AdministrativeChecklistLineState = (typeof AdministrativeChecklistLineState)[keyof typeof AdministrativeChecklistLineState];

export type ConfirmedRequirementView = Readonly<{
  requirementId: string;
  title: string;
  expectedDocumentType: string;
  required: boolean;
  applicable: boolean;
  signatureRequired: boolean;
  matchedDocumentId?: string | undefined;
}>;

export type AdministrativeDocumentView = Readonly<{
  documentId: string;
  validatedRevisionId?: string | undefined;
}>;

export type AdministrativeDocumentRevisionView = Readonly<{
  revisionId: string;
  status: string;
  hasAttachedFile: boolean;
  expiresAt?: Date | undefined;
}>;

export type AdministrativeChecklistLine = Readonly<{
  requirementId: string;
  title: string;
  expectedDocumentType: string;
  required: boolean;
  applicable: boolean;
  state: AdministrativeChecklistLineState;
  matchedDocumentId?: string | undefined;
}>;

export type AdministrativeChecklistResult = Readonly<{
  lines: readonly AdministrativeChecklistLine[];
  completionPercentage: number;
}>;

const FINAL_POSITIVE_STATES: readonly AdministrativeChecklistLineState[] = [AdministrativeChecklistLineState.Valide, AdministrativeChecklistLineState.Pret];

function deriveLineState(input: {
  requirement: ConfirmedRequirementView;
  document?: AdministrativeDocumentView | undefined;
  revisions: readonly AdministrativeDocumentRevisionView[];
  now: Date;
}): AdministrativeChecklistLineState {
  if (!input.requirement.applicable) {
    return AdministrativeChecklistLineState.NonApplicable;
  }
  if (!input.document) {
    return AdministrativeChecklistLineState.Manquant;
  }
  if (input.document.validatedRevisionId) {
    const validatedRevision = input.revisions.find((revision) => revision.revisionId === input.document?.validatedRevisionId);
    if (validatedRevision?.expiresAt && validatedRevision.expiresAt.getTime() < input.now.getTime()) {
      return AdministrativeChecklistLineState.Expire;
    }
    return AdministrativeChecklistLineState.Valide;
  }
  const latestWithFile = [...input.revisions].reverse().find((revision) => revision.hasAttachedFile);
  if (!latestWithFile) {
    return AdministrativeChecklistLineState.ACompleter;
  }
  if (latestWithFile.status === "IN_REVIEW") {
    return AdministrativeChecklistLineState.EnValidation;
  }
  return AdministrativeChecklistLineState.AVerifier;
}

export function computeAdministrativeChecklist(input: {
  requirements: readonly ConfirmedRequirementView[];
  documentsById: ReadonlyMap<string, AdministrativeDocumentView>;
  revisionsByDocumentId: ReadonlyMap<string, readonly AdministrativeDocumentRevisionView[]>;
  now: Date;
}): AdministrativeChecklistResult {
  const lines: AdministrativeChecklistLine[] = input.requirements.map((requirement) => {
    const document = requirement.matchedDocumentId ? input.documentsById.get(requirement.matchedDocumentId) : undefined;
    const revisions = document ? input.revisionsByDocumentId.get(document.documentId) ?? [] : [];
    const state = deriveLineState({ requirement, document, revisions, now: input.now });
    return {
      requirementId: requirement.requirementId,
      title: requirement.title,
      expectedDocumentType: requirement.expectedDocumentType,
      required: requirement.required,
      applicable: requirement.applicable,
      state,
      matchedDocumentId: requirement.matchedDocumentId,
    };
  });

  const countable = lines.filter((line) => line.state !== AdministrativeChecklistLineState.NonApplicable);
  const done = countable.filter((line) => FINAL_POSITIVE_STATES.includes(line.state));
  const completionPercentage = countable.length === 0 ? 0 : Math.round((100 * done.length) / countable.length);

  return { lines, completionPercentage };
}
