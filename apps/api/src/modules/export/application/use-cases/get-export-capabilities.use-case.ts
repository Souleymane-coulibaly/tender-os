import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ExportFormat } from "../../domain/export-format";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";

export type GetExportCapabilitiesQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/** Même vocabulaire que `NoActiveExportTemplateVersionError`/`ExportTemplateNotFoundError`
 *  (mission Sprint 8A.2 — "un seul vocabulaire d'erreur, jamais un second calcul divergent côté
 *  capacités") : un `canExport: true` ici est garanti de ne jamais échouer pour l'une de ces deux
 *  raisons lors d'un appel réel à `PreviewExportUseCase`, la résolution utilisée (`list` du même
 *  repository) est strictement identique. */
export type ExportCapabilityBlockerCode = "EXPORT_TEMPLATE_MISSING" | "TEMPLATE_VERSION_MISSING";

export type ExportCapabilityBlocker = Readonly<{ code: ExportCapabilityBlockerCode }>;

export type ExportCapabilities = Readonly<{
  canExport: boolean;
  canExportDocx: boolean;
  canExportPdf: boolean;
  canUseTemplate: boolean;
  blockers: readonly ExportCapabilityBlocker[];
}>;

/**
 * Capacités d'export réellement configurées pour cette organisation (mission Sprint 8A.2 —
 * "le frontend doit savoir avant le clic si l'export est possible"). Nested sous
 * `/tenders/:tenderId` pour la même chaîne d'autorisation que le reste de l'écran Tender
 * (Tender → client → `ClientPermission.ReadExport`), même si la résolution elle-même reste
 * Organization-wide (`ExportTemplate` est organisation-scope uniquement — voir
 * `export-template.aggregate.ts`, aucune notion de Tender/Client à ce jour). Réutilise le MÊME
 * repository que `ListExportTemplatesUseCase`/`PreviewExportUseCase`, jamais un second calcul de
 * "quel template est utilisable".
 */
@Injectable()
export class GetExportCapabilitiesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
  ) {}

  async execute(query: GetExportCapabilitiesQuery): Promise<ExportCapabilities> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
      actorId: query.actorId,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const templates = await this.exportTemplateRepository.list({ organizationId: query.organizationId });

    if (templates.length === 0) {
      return { canExport: false, canExportDocx: false, canExportPdf: false, canUseTemplate: false, blockers: [{ code: "EXPORT_TEMPLATE_MISSING" }] };
    }

    const activeVersions = templates.map((entry) => entry.activeVersion).filter((version): version is NonNullable<typeof version> => version !== undefined);
    if (activeVersions.length === 0) {
      return { canExport: false, canExportDocx: false, canExportPdf: false, canUseTemplate: false, blockers: [{ code: "TEMPLATE_VERSION_MISSING" }] };
    }

    const canExportDocx = activeVersions.some((version) => version.format === ExportFormat.Docx);
    const canExportPdf = activeVersions.some((version) => version.format === ExportFormat.Pdf);

    return { canExport: true, canExportDocx, canExportPdf, canUseTemplate: true, blockers: [] };
  }
}
