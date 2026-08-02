import type { SignatureLevel } from "../domain/signature-level";
import { SignatureArtifact, type SignatureArtifactKind, type SignatureArtifactSource, type SignatureArtifactVerificationStatus } from "../domain/signature-artifact";
import { SignatureParticipant, type SignatureParticipantStatus } from "../domain/signature-participant";
import { SignatureRequirement, type SignatureRequirementConfidence, type SignatureRequirementStatus } from "../domain/signature-requirement";
import { Signatory, type SignatoryStatus } from "../domain/signatory";
import type { SignatureProviderName } from "../domain/signature-level";
import { SignatureTransaction } from "../domain/signature-transaction.aggregate";
import type { SignatureTransactionStatus } from "../domain/signature-transaction-status";

export type PersistedSignatureRequirement = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  documentRef: string;
  sourceDce: string | null;
  pageOrSection: string | null;
  mandatory: boolean;
  momentText: string | null;
  format: string | null;
  levelExpected: string | null;
  certificateRequirement: string | null;
  signatoryExpected: string | null;
  confidence: string;
  status: string;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  comment: string | null;
  createdBy: string;
  createdAt: Date;
};

export function toDomainRequirement(r: PersistedSignatureRequirement): SignatureRequirement {
  return SignatureRequirement.rehydrate({
    id: r.id,
    organizationId: r.organizationId,
    clientAccountId: r.clientAccountId,
    tenderId: r.tenderId,
    documentRef: r.documentRef,
    sourceDce: r.sourceDce ?? undefined,
    pageOrSection: r.pageOrSection ?? undefined,
    mandatory: r.mandatory,
    momentText: r.momentText ?? undefined,
    format: r.format ?? undefined,
    levelExpected: (r.levelExpected as SignatureLevel) ?? undefined,
    certificateRequirement: r.certificateRequirement ?? undefined,
    signatoryExpected: r.signatoryExpected ?? undefined,
    confidence: r.confidence as SignatureRequirementConfidence,
    status: r.status as SignatureRequirementStatus,
    confirmedBy: r.confirmedBy ?? undefined,
    confirmedAt: r.confirmedAt ?? undefined,
    comment: r.comment ?? undefined,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  });
}

export type PersistedSignatory = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  professionalEmail: string;
  jobTitle: string | null;
  organizationName: string | null;
  authorityText: string | null;
  authorityDocumentId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  status: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdBy: string;
  createdAt: Date;
};

export function toDomainSignatory(s: PersistedSignatory): Signatory {
  return Signatory.rehydrate({
    id: s.id,
    organizationId: s.organizationId,
    clientAccountId: s.clientAccountId,
    tenderId: s.tenderId,
    userId: s.userId ?? undefined,
    firstName: s.firstName,
    lastName: s.lastName,
    professionalEmail: s.professionalEmail,
    jobTitle: s.jobTitle ?? undefined,
    organizationName: s.organizationName ?? undefined,
    authorityText: s.authorityText ?? undefined,
    authorityDocumentId: s.authorityDocumentId ?? undefined,
    validFrom: s.validFrom ?? undefined,
    validUntil: s.validUntil ?? undefined,
    status: s.status as SignatoryStatus,
    verifiedBy: s.verifiedBy ?? undefined,
    verifiedAt: s.verifiedAt ?? undefined,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
  });
}

export type PersistedSignatureTransaction = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportArtifactId: string;
  provider: string;
  providerTransactionId: string | null;
  status: string;
  requestedLevel: string | null;
  confirmedLevel: string | null;
  levelSource: string | null;
  documentHash: string;
  createdBy: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export function toDomainTransaction(t: PersistedSignatureTransaction): SignatureTransaction {
  return SignatureTransaction.rehydrate({
    id: t.id,
    organizationId: t.organizationId,
    clientAccountId: t.clientAccountId,
    tenderId: t.tenderId,
    exportArtifactId: t.exportArtifactId,
    provider: t.provider as SignatureProviderName,
    providerTransactionId: t.providerTransactionId ?? undefined,
    status: t.status as SignatureTransactionStatus,
    requestedLevel: (t.requestedLevel as SignatureLevel) ?? undefined,
    confirmedLevel: (t.confirmedLevel as SignatureLevel) ?? undefined,
    levelSource: t.levelSource ?? undefined,
    documentHash: t.documentHash,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    startedAt: t.startedAt ?? undefined,
    completedAt: t.completedAt ?? undefined,
    errorCode: t.errorCode ?? undefined,
    errorMessage: t.errorMessage ?? undefined,
  });
}

export type PersistedSignatureParticipant = {
  id: string;
  organizationId: string;
  signatureTransactionId: string;
  signatoryId: string;
  providerParticipantId: string | null;
  sequence: number;
  status: string;
  invitationRedirectUrl: string | null;
  createdAt: Date;
};

export function toDomainParticipant(p: PersistedSignatureParticipant): SignatureParticipant {
  return SignatureParticipant.rehydrate({
    id: p.id,
    organizationId: p.organizationId,
    signatureTransactionId: p.signatureTransactionId,
    signatoryId: p.signatoryId,
    providerParticipantId: p.providerParticipantId ?? undefined,
    sequence: p.sequence,
    status: p.status as SignatureParticipantStatus,
    invitationRedirectUrl: p.invitationRedirectUrl ?? undefined,
    createdAt: p.createdAt,
  });
}

export type PersistedSignatureArtifact = {
  id: string;
  organizationId: string;
  signatureTransactionId: string;
  kind: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  storageKey: string;
  providerArtifactId: string | null;
  isFakeTestEvidence: boolean;
  source: string;
  importedBy: string | null;
  verificationStatus: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
};

export function toDomainArtifact(a: PersistedSignatureArtifact): SignatureArtifact {
  return SignatureArtifact.rehydrate({
    id: a.id,
    organizationId: a.organizationId,
    signatureTransactionId: a.signatureTransactionId,
    kind: a.kind as SignatureArtifactKind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    fileHash: a.fileHash,
    storageKey: a.storageKey,
    providerArtifactId: a.providerArtifactId ?? undefined,
    isFakeTestEvidence: a.isFakeTestEvidence,
    source: a.source as SignatureArtifactSource,
    importedBy: a.importedBy ?? undefined,
    verificationStatus: (a.verificationStatus as SignatureArtifactVerificationStatus) ?? undefined,
    verifiedBy: a.verifiedBy ?? undefined,
    verifiedAt: a.verifiedAt ?? undefined,
    createdAt: a.createdAt,
  });
}
