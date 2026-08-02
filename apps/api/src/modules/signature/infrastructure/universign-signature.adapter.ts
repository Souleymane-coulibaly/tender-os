import { Injectable } from "@nestjs/common";
import { SIGNATURE_PROVIDER } from "../domain/signature-level";
import { UniversignProductionCallForbiddenError } from "../domain/errors";
import type {
  AddParticipantInput,
  AddParticipantResult,
  CreateTransactionInput,
  CreateTransactionResult,
  GetTransactionResult,
  ProviderTransactionStatus,
  SignatureProviderPort,
  UploadDocumentInput,
  UploadDocumentResult,
} from "../application/ports/signature-provider.port";
import type { LoadedSignatureConfig } from "./signature-config";

/**
 * Mission Sprint 8A §30/§33/§36 — adapter fondé EXCLUSIVEMENT sur la documentation officielle
 * Universign, RE-VÉRIFIÉE après un audit de correction (les citations ci-dessous sont issues
 * d'une relecture directe de apps.universign.com/docs/api, .../docs/services/transaction_service,
 * .../docs/guides/transactions/quick_start, .../docs/guides/transactions/participants/*) :
 *
 * - Authentification : Basic (`-u API_KEY:`) OU Bearer (`Authorization: Bearer API_KEY`) — les
 *   deux sont officiellement documentés ("Alternatively, you can authenticate via bearer auth") ;
 *   cet adapter utilise Bearer, un choix, jamais une supposition.
 * - Base URLs confirmées : Production `https://api.universign.com` (interdite ici), Alpha
 *   `https://api.alpha.universign.com`.
 * - **CORPS DE REQUÊTE : form-encoded (`application/x-www-form-urlencoded`) pour TOUTES les
 *   requêtes POST hors upload de fichier — jamais du JSON.** Confirmé par les exemples curl
 *   documentés (`-d name=... -d duration=...` pour la création de transaction, `-d document=...`
 *   pour l'attachement de document, `-d email=... -d min_signature_level=...` pour les
 *   participants). La version précédente de cet adapter envoyait du JSON partout — bug réel
 *   corrigé après audit, jamais testé contre un vrai serveur avant cette correction non plus
 *   (aucun accès Universign réel dans ce sprint).
 * - Transactions : `POST /v1/transactions` (form-encoded, champ `name` utilisé ici comme
 *   référence lisible), `GET /v1/transactions/{id}`, `POST /v1/transactions/{id}/start` (aucun
 *   corps), `POST /v1/transactions/{id}/cancel` (aucun corps, même motif que `/start`).
 * - Document : `POST /v1/files` en **multipart/form-data**, champ `file` (contenu binaire réel,
 *   jamais du base64 encapsulé en JSON) — confirmé par `curl .../v1/files -F file=@Document.pdf`.
 *   Puis `POST /v1/transactions/{id}/documents` form-encoded, champ `document` = l'identifiant de
 *   fichier retourné par l'étape précédente (jamais `fileId` en JSON).
 * - Participant : `POST /v1/transactions/{id}/participants` form-encoded, champs confirmés :
 *   `email`, `full_name` (nom complet, PAS `firstname`/`lastname` séparés — corrigé après audit),
 *   `min_signature_level` (format confirmé : `level0`…`level4`, minuscule, jamais `LEVEL0`),
 *   `invitation_redirect_url`, `redirect_time_out` (optionnel, secondes).
 * - Documents signés : `GET /v1/transactions/{id}/archive/documents/{documentId}/download` (forme
 *   exacte NON garantie à 100% par la documentation textuelle consultée — reste dans
 *   BLOCKED_BY_UNIVERSIGN_ACCESS, à confirmer au Sprint 8B avec un compte réel).
 * - Preuve (attestation émetteur) : `GET /v1/archives/{id}/requester-attestation?lang=fr`.
 *
 * Ce que la documentation NE confirme TOUJOURS PAS avec certitude suffisante (jamais inventé,
 * jamais testé contre un vrai serveur) : le modèle complet "field + signature" (Universign expose
 * aussi des endpoints `.../documents/{id}/fields` et `.../signatures` pour un placement précis
 * d'un widget de signature sur une page — volontairement NON utilisés ici, TenderOS n'a besoin que
 * "ce signataire signe ce document à ce niveau", couvert par `participants` +
 * `min_signature_level`, un usage légitime et documenté de l'API, pas une simplification
 * inventée) ; la différenciation exacte de statut "refusé" côté webhook ; le chemin exact de
 * téléchargement du document signé. Voir le rapport final, section BLOCKED_BY_UNIVERSIGN_ACCESS.
 *
 * Sécurité : n'appelle JAMAIS Production (`SignatureConfig` refuse déjà cette configuration à la
 * source, `assertNotProduction` est une seconde barrière défensive) ; ne loggue jamais la clé API
 * ni un payload complet.
 */
@Injectable()
export class UniversignSignatureAdapter implements SignatureProviderPort {
  readonly providerName = SIGNATURE_PROVIDER.Universign;

  constructor(private readonly config: NonNullable<LoadedSignatureConfig["universign"]>) {
    this.assertNotProduction();
  }

  private assertNotProduction(): void {
    if (this.config.apiBaseUrl.includes("api.universign.com") && !this.config.apiBaseUrl.includes("alpha")) {
      // Défense en profondeur : `loadSignatureConfig` refuse déjà PRODUCTION, cette vérification
      // ne devrait jamais se déclencher en pratique.
      throw new UniversignProductionCallForbiddenError();
    }
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.apiKey}` };
  }

  private async send(path: string, method: string, body?: string | FormData, extraHeaders?: Record<string, string>): Promise<unknown> {
    const url = `${this.config.apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { ...this.authHeaders(), ...extraHeaders },
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Jamais le corps brut de l'erreur logué (peut contenir des données sensibles) — seul le
        // statut HTTP est propagé (mission §71/§72 "erreurs sanitised").
        throw new Error(`Universign API request failed with status ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }
      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Form-encoded — le format réel utilisé par TOUTES les requêtes Universign hors upload de
   *  fichier (confirmé par les exemples `curl -d key=value` documentés). */
  private async sendForm(path: string, fields: Record<string, string | number | undefined>): Promise<unknown> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.send(path, "POST", params.toString(), { "Content-Type": "application/x-www-form-urlencoded" });
  }

  async createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult> {
    const result = (await this.sendForm("/v1/transactions", { name: input.localTransactionId })) as { id: string };
    return { providerTransactionId: result.id };
  }

  async uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
    // Étape 1 — multipart/form-data réel, jamais du JSON+base64 (confirmé : `curl .../v1/files -F file=@...`).
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(input.content)], { type: input.mimeType }), input.fileName);
    const uploaded = (await this.send("/v1/files", "POST", form)) as { id: string };

    // Étape 2 — form-encoded, champ `document` (jamais `fileId` en JSON).
    const attached = (await this.sendForm(`/v1/transactions/${input.providerTransactionId}/documents`, { document: uploaded.id })) as { id: string };
    return { providerDocumentId: attached.id };
  }

  async addParticipant(input: AddParticipantInput): Promise<AddParticipantResult> {
    const result = (await this.sendForm(`/v1/transactions/${input.providerTransactionId}/participants`, {
      email: input.email,
      full_name: `${input.firstName} ${input.lastName}`.trim(),
      min_signature_level: input.level.toLowerCase(),
      invitation_redirect_url: input.invitationRedirectUrl,
    })) as { id: string };
    return { providerParticipantId: result.id };
  }

  async startTransaction(input: { providerTransactionId: string }): Promise<void> {
    await this.sendForm(`/v1/transactions/${input.providerTransactionId}/start`, {});
  }

  async getTransaction(input: { providerTransactionId: string }): Promise<GetTransactionResult> {
    const result = (await this.send(`/v1/transactions/${input.providerTransactionId}`, "GET")) as { id: string; status: string };
    return { providerTransactionId: result.id, status: mapProviderStatus(result.status) };
  }

  async cancelTransaction(input: { providerTransactionId: string }): Promise<void> {
    await this.sendForm(`/v1/transactions/${input.providerTransactionId}/cancel`, {});
  }

  async downloadSignedDocument(input: { providerTransactionId: string; providerDocumentId: string }): Promise<Buffer> {
    const result = await this.send(`/v1/transactions/${input.providerTransactionId}/archive/documents/${input.providerDocumentId}/download`, "GET");
    return result as Buffer;
  }

  async downloadEvidence(input: { providerTransactionId: string }): Promise<Buffer> {
    const result = await this.send(`/v1/archives/${input.providerTransactionId}/requester-attestation?lang=fr`, "GET");
    return result as Buffer;
  }
}

function mapProviderStatus(raw: string): ProviderTransactionStatus {
  const normalized = raw.toUpperCase();
  const known: readonly ProviderTransactionStatus[] = ["DRAFT", "STARTED", "PAUSED", "CANCELLED", "EXPIRED", "COMPLETED"];
  return (known as readonly string[]).includes(normalized) ? (normalized as ProviderTransactionStatus) : "DRAFT";
}
