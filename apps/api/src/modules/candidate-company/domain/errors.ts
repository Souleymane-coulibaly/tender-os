import { DomainError } from "../../../shared-kernel/domain-error";

export class CandidateCompanyNotFoundError extends DomainError {
  readonly code = "CANDIDATE_COMPANY_NOT_FOUND";
  constructor() {
    super("Candidate company not found or not accessible.");
  }
}

/** Checkpoint TENDEROS-2.1-CCV2-A — le rôle d'ORGANISATION de l'acteur ne porte pas la permission
 *  candidate requise. Distinct de `CandidateCompanyNotFoundError` : celui-ci ne révèle jamais
 *  l'existence d'une ressource (404 anti-énumération), celui-là ne parle QUE du rôle de l'acteur
 *  dans SA PROPRE organisation et n'apprend donc rien sur une ressource d'un autre tenant. */
export class CandidatePermissionMissingError extends DomainError {
  readonly code = "CANDIDATE_PERMISSION_MISSING";
  constructor() {
    super("Actor does not have the required candidate company permission.");
  }
}

/**
 * Checkpoint TENDEROS-2.1-CCV2-G.1 — POLICY A (« hard require candidate »).
 *
 * Un Tender EXPLOITABLE ne peut plus naître sans entreprise candidate : c'est l'entité juridique
 * qui répond, et sans elle tout le travail candidate-dépendant (DC1/DC2/DC4, mémoire technique,
 * GO/NO-GO, checklist) devrait deviner à qui il appartient — or deviner est précisément ce que
 * l'audit CCV2-G interdit.
 *
 * Distinct de `CandidateCompanyNotFoundError` : celui-ci dit « vous n'en avez pas désigné » (422,
 * l'appelant corrige sa requête), l'autre « celle que vous désignez n'existe pas ici » (404,
 * anti-énumération). Les confondre révélerait l'existence d'entreprises d'autres organisations.
 *
 * N'est JAMAIS levée pour un Tender HISTORIQUE déjà en base : la colonne reste nullable et aucun
 * backfill automatique n'existe (l'attribution serait ambiguë — 14 organisations portent 2+
 * entreprises candidates dans les données d'audit). Elle borne la CRÉATION, pas l'existant.
 */
export class CandidateCompanyRequiredError extends DomainError {
  readonly code = "CANDIDATE_COMPANY_REQUIRED";
  constructor() {
    super("A candidate company must be explicitly selected for this tender.");
  }
}

export class DuplicateCandidateCompanyNameError extends DomainError {
  readonly code = "DUPLICATE_CANDIDATE_COMPANY_NAME";
  constructor() {
    super("A candidate company with this name already exists in this organization.");
  }
}

export class InvalidCandidateCompanyStatusError extends DomainError {
  readonly code = "INVALID_CANDIDATE_COMPANY_STATUS";
  constructor(value: string) {
    super(`Invalid candidate company status: "${value}".`);
  }
}

export class CandidateCompanyArchivedError extends DomainError {
  readonly code = "CANDIDATE_COMPANY_ARCHIVED";
  constructor() {
    super("This candidate company is archived and cannot be mutated.");
  }
}

/** Réutilise la validation Luhn existante (company-profile/domain/french-company-identifiers.ts) —
 *  jamais réimplémentée ici. */
export class InvalidSirenError extends DomainError {
  readonly code = "INVALID_SIREN";
  constructor() {
    super("Invalid SIREN: failed format or checksum validation.");
  }
}

/** Checkpoint CCV2-F.2 — meme validation que le Legacy (`isValidFrenchVatNumber`), appliquee
 *  uniquement aux numeros prefixes FR : un numero intracommunautaire etranger n'a pas la meme
 *  structure et le rejeter serait un faux positif. */
export class InvalidCandidateVatNumberError extends DomainError {
  readonly code = "INVALID_VAT_NUMBER";
  constructor() {
    super("Invalid French VAT number: failed format or checksum validation.");
  }
}

export class InvalidSiretError extends DomainError {
  readonly code = "INVALID_SIRET";
  constructor() {
    super("Invalid SIRET: failed format or checksum validation.");
  }
}

/** Unicité au niveau organisation, pas seulement au niveau entreprise candidate (mission §8) — un
 *  SIRET est un identifiant INSEE réel, jamais partageable entre deux entreprises candidates
 *  distinctes d'une même organisation. */
export class DuplicateCandidateEstablishmentSiretError extends DomainError {
  readonly code = "DUPLICATE_CANDIDATE_ESTABLISHMENT_SIRET";
  constructor() {
    super("A candidate establishment with this SIRET already exists in this organization.");
  }
}

export class CandidateEstablishmentNotFoundError extends DomainError {
  readonly code = "CANDIDATE_ESTABLISHMENT_NOT_FOUND";
  constructor() {
    super("Candidate establishment not found or not accessible.");
  }
}

/** Au plus un établissement principal par entreprise candidate (mission §8) — backstop applicatif
 *  devant l'index unique partiel `candidate_establishments_one_principal_per_company` (migration). */
export class DuplicatePrincipalCandidateEstablishmentError extends DomainError {
  readonly code = "DUPLICATE_PRINCIPAL_CANDIDATE_ESTABLISHMENT";
  constructor() {
    super("This candidate company already has a principal establishment.");
  }
}
