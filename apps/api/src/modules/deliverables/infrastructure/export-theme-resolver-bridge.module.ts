import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { THEME_RESOLVER, type ResolvedExportTheme, type ThemeResolver } from "../../export/application/ports/theme-resolver";
import { DeliverablesModule } from "../deliverables.module";
import { DOCUMENT_THEME_REPOSITORY, type DocumentThemeRepository } from "../application/ports/document-theme.repository";
import { TemplateThemeResolverService } from "../application/services/template-theme-resolver.service";
import type { DocumentThemeVersion } from "../domain/document-theme-version.entity";

function toResolvedExportTheme(versionId: string, sourceLevel: string, version: DocumentThemeVersion): ResolvedExportTheme {
  return {
    versionId,
    sourceLevel,
    logoStorageKey: version.logoStorageKey,
    accentColor: version.accentColor,
    fontFamily: version.fontFamily,
  };
}

@Injectable()
class DeliverablesThemeResolverAdapter implements ThemeResolver {
  constructor(
    private readonly templateThemeResolverService: TemplateThemeResolverService,
    @Inject(DOCUMENT_THEME_REPOSITORY) private readonly documentThemeRepository: DocumentThemeRepository,
  ) {}

  async resolveActive(input: { organizationId: string; clientAccountId: string; tenderId: string }): Promise<ResolvedExportTheme | null> {
    const resolved = await this.templateThemeResolverService.resolveTheme(input);
    if (!resolved) return null;
    return toResolvedExportTheme(resolved.version.id, resolved.sourceLevel, resolved.version);
  }

  async findByVersionId(input: { organizationId: string; versionId: string }): Promise<ResolvedExportTheme | null> {
    const version = await this.documentThemeRepository.findVersionById(input);
    if (!version) return null;
    // `sourceLevel` n'est pas porté par `DocumentThemeVersion` lui-même (seulement par le résultat
    // d'une résolution par hiérarchie) — placeholder ignoré par l'appelant (GenerateFinalExportUseCase),
    // qui réutilise le `themeSourceLevel` déjà figé sur l'aperçu, jamais recalculé ici.
    return toResolvedExportTheme(version.id, "UNUSED", version);
  }
}

/**
 * Pont `@Global()` entre Export (qui définit son propre port `ThemeResolver`, mission Sprint
 * 8A.2) et Deliverables (qui implémente la résolution réelle via `TemplateThemeResolverService`,
 * Sprint 8A.1) — même motif exact que `RoutingPolicyBridgeModule`/`ExtractionTriggerBridgeModule` :
 * relie deux modules sans jamais faire dépendre Export de Deliverables (import direct interdit,
 * Deliverables dépend déjà d'Export — un cycle Nest). Si ce module n'est pas importé par
 * `AppModule`, `PreviewExportUseCase`/`GenerateFinalExportUseCase` reçoivent `undefined` pour ce
 * token (`@Optional()`) et se comportent comme avant Sprint 8A.2 (aucun thème appliqué) — aucune
 * régression possible par omission, mais en production ce pont DOIT être importé : sans lui,
 * aucun thème n'est jamais appliqué à un export, exactement le bug que ce sprint corrige.
 */
@Global()
@Module({
  imports: [DeliverablesModule],
  providers: [{ provide: THEME_RESOLVER, useClass: DeliverablesThemeResolverAdapter }],
  exports: [THEME_RESOLVER],
})
export class ExportThemeResolverBridgeModule {}
