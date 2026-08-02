import type { SignatureLevel } from "../../domain/signature-level";

export type CreateTransactionInput = Readonly<{ organizationId: string; localTransactionId: string }>;
export type CreateTransactionResult = Readonly<{ providerTransactionId: string }>;

export type UploadDocumentInput = Readonly<{ providerTransactionId: string; fileName: string; content: Buffer; mimeType: string }>;
export type UploadDocumentResult = Readonly<{ providerDocumentId: string }>;

export type AddParticipantInput = Readonly<{
  providerTransactionId: string;
  providerDocumentId: string;
  firstName: string;
  lastName: string;
  email: string;
  level: SignatureLevel;
  sequence: number;
  invitationRedirectUrl: string;
}>;
export type AddParticipantResult = Readonly<{ providerParticipantId: string }>;

export type ProviderTransactionStatus =
  | "DRAFT"
  | "STARTED"
  | "PAUSED"
  | "CANCELLED"
  | "EXPIRED"
  | "COMPLETED";

export type GetTransactionResult = Readonly<{ providerTransactionId: string; status: ProviderTransactionStatus }>;

/**
 * Mission Sprint 8A §32/§35 — abstraction indépendante du prestataire. Méthodes et statuts
 * fondés EXCLUSIVEMENT sur la documentation officielle Universign cartographiée (rapport §D) :
 * création de transaction (`POST /v1/transactions`), upload (`POST /v1/files` +
 * `POST .../documents`), participant (`POST .../participants`), démarrage
 * (`POST .../start`), statut (`GET .../{id}`), annulation (`POST .../cancel`), téléchargement du
 * document signé et de l'attestation (`GET /v1/archives/...`). Le domaine ne dépend JAMAIS
 * directement d'Universign — uniquement de cette interface.
 */
export interface SignatureProviderPort {
  readonly providerName: string;
  createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult>;
  uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult>;
  addParticipant(input: AddParticipantInput): Promise<AddParticipantResult>;
  startTransaction(input: { providerTransactionId: string }): Promise<void>;
  getTransaction(input: { providerTransactionId: string }): Promise<GetTransactionResult>;
  cancelTransaction(input: { providerTransactionId: string }): Promise<void>;
  downloadSignedDocument(input: { providerTransactionId: string; providerDocumentId: string }): Promise<Buffer>;
  downloadEvidence(input: { providerTransactionId: string }): Promise<Buffer>;
}

export const SIGNATURE_PROVIDER_PORT = Symbol("SIGNATURE_PROVIDER_PORT");
