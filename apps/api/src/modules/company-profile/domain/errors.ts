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
