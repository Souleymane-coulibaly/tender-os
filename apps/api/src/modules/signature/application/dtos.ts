import type { SignatureArtifact } from "../domain/signature-artifact";
import type { SignatureParticipant } from "../domain/signature-participant";
import type { SignatureRequirement } from "../domain/signature-requirement";
import type { Signatory } from "../domain/signatory";
import type { SignatureTransaction } from "../domain/signature-transaction.aggregate";

export type SignatureRequirementSummary = {
  id: string;
  tenderId: string;
  documentRef: string;
  sourceDce?: string | undefined;
  pageOrSection?: string | undefined;
  mandatory: boolean;
  levelExpected?: string | undefined;
  confidence: string;
  status: string;
  confirmedBy?: string | undefined;
  confirmedAt?: string | undefined;
  comment?: string | undefined;
  createdAt: string;
};

export function toSignatureRequirementSummary(r: SignatureRequirement): SignatureRequirementSummary {
  return {
    id: r.id,
    tenderId: r.tenderId,
    documentRef: r.documentRef,
    sourceDce: r.sourceDce,
    pageOrSection: r.pageOrSection,
    mandatory: r.mandatory,
    levelExpected: r.levelExpected,
    confidence: r.confidence,
    status: r.status,
    confirmedBy: r.confirmedBy,
    confirmedAt: r.confirmedAt?.toISOString(),
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}

export type SignatorySummary = {
  id: string;
  tenderId: string;
  firstName: string;
  lastName: string;
  professionalEmail: string;
  jobTitle?: string | undefined;
  organizationName?: string | undefined;
  status: string;
  verifiedBy?: string | undefined;
  verifiedAt?: string | undefined;
  createdAt: string;
};

export function toSignatorySummary(s: Signatory): SignatorySummary {
  return {
    id: s.id,
    tenderId: s.tenderId,
    firstName: s.firstName,
    lastName: s.lastName,
    professionalEmail: s.professionalEmail,
    jobTitle: s.jobTitle,
    organizationName: s.organizationName,
    status: s.status,
    verifiedBy: s.verifiedBy,
    verifiedAt: s.verifiedAt?.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}

export type SignatureArtifactSummary = {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  isFakeTestEvidence: boolean;
  source: string;
  verificationStatus?: string | undefined;
  createdAt: string;
};

export function toSignatureArtifactSummary(a: SignatureArtifact): SignatureArtifactSummary {
  return {
    id: a.id,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    fileHash: a.fileHash,
    isFakeTestEvidence: a.isFakeTestEvidence,
    source: a.source,
    verificationStatus: a.verificationStatus,
    createdAt: a.createdAt.toISOString(),
  };
}

export type SignatureParticipantSummary = { id: string; signatoryId: string; sequence: number; status: string };

export function toSignatureParticipantSummary(p: SignatureParticipant): SignatureParticipantSummary {
  return { id: p.id, signatoryId: p.signatoryId, sequence: p.sequence, status: p.status };
}

export type SignatureTransactionSummary = {
  id: string;
  tenderId: string;
  exportArtifactId: string;
  provider: string;
  status: string;
  requestedLevel?: string | undefined;
  confirmedLevel?: string | undefined;
  documentHash: string;
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  errorCode?: string | undefined;
  participants: readonly SignatureParticipantSummary[];
  artifacts: readonly SignatureArtifactSummary[];
};

export function toSignatureTransactionSummary(input: {
  transaction: SignatureTransaction;
  participants: readonly SignatureParticipant[];
  artifacts: readonly SignatureArtifact[];
}): SignatureTransactionSummary {
  return {
    id: input.transaction.id,
    tenderId: input.transaction.tenderId,
    exportArtifactId: input.transaction.exportArtifactId,
    provider: input.transaction.provider,
    status: input.transaction.status,
    requestedLevel: input.transaction.requestedLevel,
    confirmedLevel: input.transaction.confirmedLevel,
    documentHash: input.transaction.documentHash,
    createdAt: input.transaction.createdAt.toISOString(),
    startedAt: input.transaction.startedAt?.toISOString(),
    completedAt: input.transaction.completedAt?.toISOString(),
    errorCode: input.transaction.errorCode,
    participants: input.participants.map(toSignatureParticipantSummary),
    artifacts: input.artifacts.map(toSignatureArtifactSummary),
  };
}
