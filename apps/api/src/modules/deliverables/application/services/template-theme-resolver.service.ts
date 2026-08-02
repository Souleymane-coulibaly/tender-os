import { Inject, Injectable } from "@nestjs/common";
import type { DeliverableTemplate } from "../../domain/deliverable-template.aggregate";
import type { DeliverableTemplateVersion } from "../../domain/deliverable-template-version.entity";
import type { DeliverableType } from "../../domain/deliverable-type";
import type { DocumentTheme } from "../../domain/document-theme.aggregate";
import type { DocumentThemeVersion } from "../../domain/document-theme-version.entity";
import { ScopeLevel } from "../../domain/scope-level";
import { SYSTEM_ORGANIZATION_ID } from "../../domain/system-organization";
import { DELIVERABLE_TEMPLATE_REPOSITORY, type DeliverableTemplateRepository } from "../ports/deliverable-template.repository";
import { DOCUMENT_THEME_REPOSITORY, type DocumentThemeRepository } from "../ports/document-theme.repository";

export type ResolvedTemplate = { template: DeliverableTemplate; version: DeliverableTemplateVersion; sourceLevel: ScopeLevel };
export type ResolvedTheme = { theme: DocumentTheme; version: DocumentThemeVersion; sourceLevel: ScopeLevel };

/**
 * Mission Sprint 8A.1 §5/§6 — résout la hiérarchie TENDER > CLIENT > ORGANIZATION > TENDEROS
 * (correctif audit Codex P1-004 — 4ᵉ palier de repli global ajouté) : le premier palier possédant
 * une version ACTIVE l'emporte, "aucune fusion silencieuse incohérente n'est autorisée". Le
 * `sourceLevel` réellement retenu est TOUJOURS retourné pour être conservé explicitement sur le
 * `Deliverable` (mission "la priorité réellement utilisée doit être explicite et conservée dans le
 * manifeste"). Le palier TENDEROS vit sous `SYSTEM_ORGANIZATION_ID`, jamais sous l'organisation de
 * l'acteur — la seule requête de résolution qui ne dépend pas de `input.organizationId`.
 */
@Injectable()
export class TemplateThemeResolverService {
  constructor(
    @Inject(DELIVERABLE_TEMPLATE_REPOSITORY) private readonly templateRepository: DeliverableTemplateRepository,
    @Inject(DOCUMENT_THEME_REPOSITORY) private readonly themeRepository: DocumentThemeRepository,
  ) {}

  async resolveTemplate(input: { organizationId: string; clientAccountId: string; tenderId: string; documentType: DeliverableType }): Promise<ResolvedTemplate | null> {
    const tenderMatch = await this.templateRepository.findActiveVersionForScope({
      organizationId: input.organizationId,
      scopeLevel: ScopeLevel.Tender,
      tenderId: input.tenderId,
      documentType: input.documentType,
    });
    if (tenderMatch) return { template: tenderMatch.template, version: tenderMatch.version, sourceLevel: ScopeLevel.Tender };

    const clientMatch = await this.templateRepository.findActiveVersionForScope({
      organizationId: input.organizationId,
      scopeLevel: ScopeLevel.Client,
      clientAccountId: input.clientAccountId,
      documentType: input.documentType,
    });
    if (clientMatch) return { template: clientMatch.template, version: clientMatch.version, sourceLevel: ScopeLevel.Client };

    const orgMatch = await this.templateRepository.findActiveVersionForScope({
      organizationId: input.organizationId,
      scopeLevel: ScopeLevel.Organization,
      documentType: input.documentType,
    });
    if (orgMatch) return { template: orgMatch.template, version: orgMatch.version, sourceLevel: ScopeLevel.Organization };

    const systemMatch = await this.templateRepository.findActiveVersionForScope({
      organizationId: SYSTEM_ORGANIZATION_ID,
      scopeLevel: ScopeLevel.TenderOS,
      documentType: input.documentType,
    });
    if (systemMatch) return { template: systemMatch.template, version: systemMatch.version, sourceLevel: ScopeLevel.TenderOS };

    return null;
  }

  async resolveTheme(input: { organizationId: string; clientAccountId: string; tenderId: string }): Promise<ResolvedTheme | null> {
    const tenderMatch = await this.themeRepository.findActiveVersionForScope({ organizationId: input.organizationId, scopeLevel: ScopeLevel.Tender, tenderId: input.tenderId });
    if (tenderMatch) return { theme: tenderMatch.theme, version: tenderMatch.version, sourceLevel: ScopeLevel.Tender };

    const clientMatch = await this.themeRepository.findActiveVersionForScope({
      organizationId: input.organizationId,
      scopeLevel: ScopeLevel.Client,
      clientAccountId: input.clientAccountId,
    });
    if (clientMatch) return { theme: clientMatch.theme, version: clientMatch.version, sourceLevel: ScopeLevel.Client };

    const orgMatch = await this.themeRepository.findActiveVersionForScope({ organizationId: input.organizationId, scopeLevel: ScopeLevel.Organization });
    if (orgMatch) return { theme: orgMatch.theme, version: orgMatch.version, sourceLevel: ScopeLevel.Organization };

    const systemMatch = await this.themeRepository.findActiveVersionForScope({ organizationId: SYSTEM_ORGANIZATION_ID, scopeLevel: ScopeLevel.TenderOS });
    if (systemMatch) return { theme: systemMatch.theme, version: systemMatch.version, sourceLevel: ScopeLevel.TenderOS };

    return null;
  }
}
