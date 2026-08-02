import { randomUUID, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SIGNATURE_PROVIDER } from "../domain/signature-level";
import type {
  AddParticipantInput,
  AddParticipantResult,
  CreateTransactionInput,
  CreateTransactionResult,
  GetTransactionResult,
  SignatureProviderPort,
  UploadDocumentInput,
  UploadDocumentResult,
} from "../application/ports/signature-provider.port";

/**
 * Mission Sprint 8A §34/§37 — utilisable UNIQUEMENT en développement local, dans les tests, et
 * dans des démonstrations locales explicitement marquées (jamais activé silencieusement en
 * production — voir `signature-config.ts` : `SIGNATURE_PROVIDER` doit être explicitement "FAKE").
 * Simule les scénarios réellement documentés par Universign (création, upload, participant,
 * démarrage, statuts, document signé, preuve) — jamais un scénario inventé. Toute preuve produite
 * est marquée `FAKE_TEST_EVIDENCE` par l'appelant (voir `SignatureArtifact.isFakeTestEvidence`),
 * jamais confondue avec une preuve réelle Universign.
 */
@Injectable()
export class FakeSignatureProviderAdapter implements SignatureProviderPort {
  readonly providerName = SIGNATURE_PROVIDER.Fake;

  private readonly transactions = new Map<string, { status: GetTransactionResult["status"]; documentContent?: Buffer }>();

  async createTransaction(_input: CreateTransactionInput): Promise<CreateTransactionResult> {
    const providerTransactionId = `fake_tx_${randomUUID()}`;
    this.transactions.set(providerTransactionId, { status: "DRAFT" });
    return { providerTransactionId };
  }

  async uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
    const entry = this.transactions.get(input.providerTransactionId);
    if (entry) entry.documentContent = input.content;
    return { providerDocumentId: `fake_doc_${randomUUID()}` };
  }

  async addParticipant(_input: AddParticipantInput): Promise<AddParticipantResult> {
    return { providerParticipantId: `fake_participant_${randomUUID()}` };
  }

  async startTransaction(input: { providerTransactionId: string }): Promise<void> {
    const entry = this.transactions.get(input.providerTransactionId);
    if (entry) entry.status = "STARTED";
  }

  async getTransaction(input: { providerTransactionId: string }): Promise<GetTransactionResult> {
    const entry = this.transactions.get(input.providerTransactionId);
    // Simule la signature immédiate au premier "started" — comportement de démonstration
    // explicite, jamais présenté comme une signature juridique réelle (mission §37).
    if (entry && entry.status === "STARTED") {
      entry.status = "COMPLETED";
    }
    return { providerTransactionId: input.providerTransactionId, status: entry?.status ?? "DRAFT" };
  }

  async cancelTransaction(input: { providerTransactionId: string }): Promise<void> {
    const entry = this.transactions.get(input.providerTransactionId);
    if (entry) entry.status = "CANCELLED";
  }

  async downloadSignedDocument(input: { providerTransactionId: string; providerDocumentId: string }): Promise<Buffer> {
    const entry = this.transactions.get(input.providerTransactionId);
    const original = entry?.documentContent ?? Buffer.from("fake signed document (demonstration only)");
    // Ajoute un marqueur visible en fin de fichier — jamais confondu avec une signature
    // cryptographique réelle, uniquement pour distinguer ce chemin dans les tests/démonstrations.
    return Buffer.concat([original, Buffer.from(`\n%FAKE_SIGNATURE_MARKER:${input.providerDocumentId}%`)]);
  }

  async downloadEvidence(input: { providerTransactionId: string }): Promise<Buffer> {
    const payload = {
      marker: "FAKE_TEST_EVIDENCE",
      providerTransactionId: input.providerTransactionId,
      generatedAt: new Date().toISOString(),
      disclaimer: "Preuve de démonstration locale — ne constitue en aucun cas une preuve de signature électronique réelle.",
    };
    return Buffer.from(JSON.stringify(payload, null, 2));
  }
}

/** Utilitaire de test — hash stable d'un contenu, pour vérifier qu'un document téléchargé
 *  correspond bien à celui uploadé (mission §51 "vérification d'intégrité"). */
export function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
