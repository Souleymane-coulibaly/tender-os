import { DomainError } from "../../../shared-kernel/domain-error";

export class CompanyLegalIdentityNotFoundError extends DomainError {
  readonly code = "COMPANY_LEGAL_IDENTITY_NOT_FOUND";
  constructor() {
    super("L'identité légale de cette entreprise candidate est introuvable.");
  }
}

export class CompanyRepresentativeNotFoundError extends DomainError {
  readonly code = "COMPANY_REPRESENTATIVE_NOT_FOUND";
  constructor() {
    super("Ce représentant est introuvable.");
  }
}

export class CompanyBankAccountNotFoundError extends DomainError {
  readonly code = "COMPANY_BANK_ACCOUNT_NOT_FOUND";
  constructor() {
    super("Ce compte bancaire est introuvable.");
  }
}

export class CompanyInsuranceNotFoundError extends DomainError {
  readonly code = "COMPANY_INSURANCE_NOT_FOUND";
  constructor() {
    super("Cette assurance est introuvable.");
  }
}

export class CompanyCertificationNotFoundError extends DomainError {
  readonly code = "COMPANY_CERTIFICATION_NOT_FOUND";
  constructor() {
    super("Cette certification est introuvable.");
  }
}

export class CompanyReferenceNotFoundError extends DomainError {
  readonly code = "COMPANY_REFERENCE_NOT_FOUND";
  constructor() {
    super("Cette référence est introuvable.");
  }
}

export class CompanyHumanResourceNotFoundError extends DomainError {
  readonly code = "COMPANY_HUMAN_RESOURCE_NOT_FOUND";
  constructor() {
    super("Cette ressource humaine est introuvable.");
  }
}

export class CompanyMaterialResourceNotFoundError extends DomainError {
  readonly code = "COMPANY_MATERIAL_RESOURCE_NOT_FOUND";
  constructor() {
    super("Cette ressource matérielle est introuvable.");
  }
}

export class CompanyDocumentAssociationNotFoundError extends DomainError {
  readonly code = "COMPANY_DOCUMENT_ASSOCIATION_NOT_FOUND";
  constructor() {
    super("Ce document n'est pas rattaché à cette entreprise candidate.");
  }
}

export class InvalidCompanyIdentifierFormatError extends DomainError {
  readonly code = "INVALID_COMPANY_IDENTIFIER_FORMAT";
  constructor(field: string) {
    super(`Le format de "${field}" est invalide.`);
  }
}

export class DuplicateSiretInOrganizationError extends DomainError {
  readonly code = "DUPLICATE_SIRET_IN_ORGANIZATION";
  constructor() {
    super("Une autre entreprise candidate de cette organisation utilise déjà ce SIRET. Passez confirmDuplicate=true si c'est volontaire.");
  }
}

export class DocumentNotUsableForCompanyProfileError extends DomainError {
  readonly code = "DOCUMENT_NOT_USABLE_FOR_COMPANY_PROFILE";
  constructor() {
    super("Ce document n'a pas encore de version exploitable et ne peut pas être rattaché.");
  }
}

export class DuplicateDocumentClientAccountAssociationError extends DomainError {
  readonly code = "DUPLICATE_DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION";
  constructor() {
    super("Ce document est déjà rattaché à cette entreprise candidate.");
  }
}

export class BankAccountArchivedInsteadOfDeletedError extends DomainError {
  readonly code = "BANK_ACCOUNT_NEVER_HARD_DELETED";
  constructor() {
    super("Un compte bancaire ne peut jamais être supprimé physiquement, seulement archivé.");
  }
}

/** Checkpoint TENDEROS-2.1-CCV2-C.1 — identifiants bancaires invalides. 422 (donnée sémantiquement
 *  fausse), jamais 400 : la forme JSON est correcte, c'est la clé de contrôle ISO qui échoue. Le
 *  message ne répète JAMAIS la valeur fournie, pour qu'un IBAN ne puisse pas fuir via un message
 *  d'erreur, un log d'exception ou une trace HTTP. */
export class InvalidIbanError extends DomainError {
  readonly code = "INVALID_IBAN";
  constructor() {
    super("Invalid IBAN: failed ISO 13616 structure or check digits.");
  }
}

export class InvalidBicError extends DomainError {
  readonly code = "INVALID_BIC";
  constructor() {
    super("Invalid BIC: failed ISO 9362 format.");
  }
}

/** Checkpoint TENDEROS-2.1-CCV2-C.1 — deux promotions CONCURRENTES du compte principal. L'index
 *  unique partiel `company_bank_accounts_one_primary_per_candidate` sérialise la course : le
 *  perdant reçoit ce conflit explicite (409), jamais un 500 brut, et l'invariant « au plus un
 *  compte principal » n'est jamais violé. L'appelant peut simplement rejouer sa promotion. */
export class PrimaryBankAccountConflictError extends DomainError {
  readonly code = "PRIMARY_BANK_ACCOUNT_CONFLICT";
  constructor() {
    super("Another primary bank account promotion is in progress for this candidate company.");
  }
}

/** Checkpoint TENDEROS-2.1-CCV2-D — l'association documentaire candidate demandée n'existe pas SOUS
 *  CE CANDIDAT (y compris lorsqu'elle existe sous un autre candidat de la même organisation, ou
 *  dans un autre tenant) : 404, jamais 403. */
export class CandidateDocumentAssociationNotFoundError extends DomainError {
  readonly code = "CANDIDATE_DOCUMENT_ASSOCIATION_NOT_FOUND";
  constructor() {
    super("Candidate company document association not found or not accessible.");
  }
}


/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — une donnée de CANDIDATURE ne peut plus être CRÉÉE via la
 * surface commerciale `ClientAccount` : sa seule source de vérité inscriptible est
 * `CandidateCompany`. Les lignes historiques restent lisibles et auditables — ce refus ne concerne
 * que les écritures NOUVELLES.
 *
 * 409 (et non 403) : ce n'est pas un défaut de permission mais un état de la surface elle-même,
 * même convention que `CLIENT_ACCOUNT_ARCHIVED`. Le message nomme le domaine concerné pour que
 * l'interface puisse orienter vers la bonne fiche.
 */
export class ClientBidderWriteRetiredError extends DomainError {
  readonly code = "CLIENT_BIDDER_WRITE_RETIRED";
  constructor(readonly domain: string) {
    super(`This bidder domain (${domain}) is now maintained on the CandidateCompany, not on the ClientAccount.`);
  }
}

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — catégorie de document incompatible avec la surface COMMERCIALE
 * du client. 422 : c'est une valeur invalide fournie par l'appelant, pas un état de la ressource.
 */
export class ClientCommercialDocumentCategoryError extends DomainError {
  readonly code = "CLIENT_COMMERCIAL_DOCUMENT_CATEGORY_INVALID";
  constructor(message: string) {
    super(message);
  }
}
