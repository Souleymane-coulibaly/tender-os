import { Injectable } from "@nestjs/common";
import { CreateDocumentWithFirstVersionUseCase, DocumentDomain, DocumentOrigin } from "../../../documents";
import type { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import type { AdministrativeDocumentSummary } from "../dtos";
import { AttachAdministrativeDocumentRevisionUseCase, CreateAdministrativeDocumentUseCase } from "../use-cases/administrative-document.use-cases";

/** Un PDF/DOCX généré server-side ne dépassera jamais quelques Mo — pas de configuration externe
 *  nécessaire (contrairement aux fichiers déposés par un acteur, potentiellement volumineux). */
const MAX_GENERATED_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

const GENERATED_FORMAT_CONFIG = {
  PDF: { mimeType: "application/pdf", extension: "pdf" },
  DOCX: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
} as const;

export type GeneratedDocumentFormat = keyof typeof GENERATED_FORMAT_CONFIG;

export type AttachGeneratedDocumentInput = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  documentType: AdministrativeDocumentType;
  label: string;
  /** Coquille `AdministrativeDocument` déjà liée à l'agrégat structuré appelant (Phase 2,
   *  `administrativeDocumentId`) — réutilisée si présente, jamais recréée. */
  existingAdministrativeDocumentId?: string | undefined;
  format: GeneratedDocumentFormat;
  fileBuffer: Buffer;
  fileNameBase: string;
  /** Sprint 8C.1 — posés uniquement pour l'Annexe TenderOS d'un formulaire officiel (jamais pour
   *  un PDF "maison" Phase 3) : quel gabarit officiel et quelles valeurs exactes ont produit cette
   *  révision, pour une reproductibilité totale (mission §9). */
  officialTemplateId?: string | undefined;
  formDataSnapshot?: Record<string, unknown> | undefined;
}>;

export type AttachGeneratedPdfInput = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  documentType: AdministrativeDocumentType;
  label: string;
  existingAdministrativeDocumentId?: string | undefined;
  pdfBuffer: Buffer;
  fileNameBase: string;
}>;

/**
 * Sprint 8C Phase 3 — factorise la "danse en 3 étapes" commune aux 5 générateurs (DC1/DC2/DC4/
 * DUME/Acte d'engagement) : stocker le PDF généré comme un `Document` réel (mission — jamais un
 * fichier attaché sans passer par la vérification `verifyAttachableDocument`/`GetDocumentUseCase`,
 * même pour un fichier que NOUS venons de générer), puis l'attacher à la pièce administrative en
 * réutilisant EXACTEMENT le flux Phase 1 (`CreateAdministrativeDocumentUseCase`/
 * `AttachAdministrativeDocumentRevisionUseCase`) — jamais un second mécanisme d'attachement.
 */
@Injectable()
export class AdministrativeGeneratedDocumentService {
  constructor(
    private readonly createDocumentUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly createAdministrativeDocumentUseCase: CreateAdministrativeDocumentUseCase,
    private readonly attachRevisionUseCase: AttachAdministrativeDocumentRevisionUseCase,
  ) {}

  async attachGeneratedPdf(input: AttachGeneratedPdfInput): Promise<AdministrativeDocumentSummary> {
    return this.attachGeneratedDocument({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      tenderId: input.tenderId,
      documentType: input.documentType,
      label: input.label,
      existingAdministrativeDocumentId: input.existingAdministrativeDocumentId,
      format: "PDF",
      fileBuffer: input.pdfBuffer,
      fileNameBase: input.fileNameBase,
    });
  }

  /** Sprint 8C.1 — même flux en 3 étapes que `attachGeneratedPdf` (jamais un second mécanisme
   *  d'attachement), généralisé au format DOCX pour l'Annexe TenderOS des formulaires officiels. */
  async attachGeneratedDocument(input: AttachGeneratedDocumentInput): Promise<AdministrativeDocumentSummary> {
    const formatConfig = GENERATED_FORMAT_CONFIG[input.format];

    const document = await this.createDocumentUseCase.execute({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      title: input.label,
      origin: DocumentOrigin.Generated,
      domain: DocumentDomain.Tender,
      category: input.documentType,
      file: { buffer: input.fileBuffer, originalFilename: `${input.fileNameBase}.${formatConfig.extension}`, mimeType: formatConfig.mimeType },
      maxFileSizeBytes: MAX_GENERATED_DOCUMENT_SIZE_BYTES,
    });

    let administrativeDocumentId = input.existingAdministrativeDocumentId;
    if (administrativeDocumentId === undefined) {
      const shell = await this.createAdministrativeDocumentUseCase.execute({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        tenderId: input.tenderId,
        documentType: input.documentType,
        label: input.label,
      });
      administrativeDocumentId = shell.id;
    }

    return this.attachRevisionUseCase.execute({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      administrativeDocumentId,
      documentId: document.id,
      officialTemplateId: input.officialTemplateId,
      formDataSnapshot: input.formDataSnapshot,
    });
  }
}
