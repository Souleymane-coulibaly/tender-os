import { AdministrativeRequirement } from "../domain/administrative-requirement.aggregate";
import type { AdministrativeDocumentType } from "../domain/administrative-document-type";
import type { AdministrativeRequirementOrigin } from "../domain/administrative-requirement-origin";
import type { AdministrativeRequirementValidationStatus } from "../domain/administrative-requirement-validation-status";

export type PersistedAdministrativeRequirement = {
  id: string;
  organizationId: string;
  tenderId: string;
  sourceDocumentId: string | null;
  sourceDocumentVersion: number | null;
  sourceLocation: string | null;
  title: string;
  description: string | null;
  requirementType: string;
  expectedDocumentType: string;
  required: boolean;
  applicable: boolean;
  dueDate: Date | null;
  validityRule: string | null;
  signatureRequired: boolean;
  originalTextReference: string | null;
  confidence: number | null;
  origin: string;
  createdBy: string;
  validatedBy: string | null;
  validationStatus: string;
  matchedDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainAdministrativeRequirement(record: PersistedAdministrativeRequirement): AdministrativeRequirement {
  return AdministrativeRequirement.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    sourceDocumentId: record.sourceDocumentId ?? undefined,
    sourceDocumentVersion: record.sourceDocumentVersion ?? undefined,
    sourceLocation: record.sourceLocation ?? undefined,
    title: record.title,
    description: record.description ?? undefined,
    requirementType: record.requirementType,
    expectedDocumentType: record.expectedDocumentType as AdministrativeDocumentType,
    required: record.required,
    applicable: record.applicable,
    dueDate: record.dueDate ?? undefined,
    validityRule: record.validityRule ?? undefined,
    signatureRequired: record.signatureRequired,
    originalTextReference: record.originalTextReference ?? undefined,
    confidence: record.confidence ?? undefined,
    origin: record.origin as AdministrativeRequirementOrigin,
    createdBy: record.createdBy,
    validatedBy: record.validatedBy ?? undefined,
    validationStatus: record.validationStatus as AdministrativeRequirementValidationStatus,
    matchedDocumentId: record.matchedDocumentId ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toAdministrativeRequirementRow(requirement: AdministrativeRequirement) {
  return {
    id: requirement.id,
    organizationId: requirement.organizationId,
    tenderId: requirement.tenderId,
    sourceDocumentId: requirement.sourceDocumentId ?? null,
    sourceDocumentVersion: requirement.sourceDocumentVersion ?? null,
    sourceLocation: requirement.sourceLocation ?? null,
    title: requirement.title,
    description: requirement.description ?? null,
    requirementType: requirement.requirementType,
    expectedDocumentType: requirement.expectedDocumentType,
    required: requirement.required,
    applicable: requirement.applicable,
    dueDate: requirement.dueDate ?? null,
    validityRule: requirement.validityRule ?? null,
    signatureRequired: requirement.signatureRequired,
    originalTextReference: requirement.originalTextReference ?? null,
    confidence: requirement.confidence ?? null,
    origin: requirement.origin,
    createdBy: requirement.createdBy,
    validatedBy: requirement.validatedBy ?? null,
    validationStatus: requirement.validationStatus,
    matchedDocumentId: requirement.matchedDocumentId ?? null,
    createdAt: requirement.createdAt,
    updatedAt: requirement.updatedAt,
  };
}
