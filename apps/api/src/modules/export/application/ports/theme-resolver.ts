export type ResolvedExportTheme = Readonly<{
  versionId: string;
  sourceLevel: string;
  logoStorageKey?: string | undefined;
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
}>;

/**
 * Port propre à Export (mission Sprint 8A.2, correction bugs #7/#8 "thème non appliqué à
 * l'export") — même principe "le port vit dans le module qui l'utilise" déjà pratiqué par
 * `generation/application/ports/routing-policy-resolver.ts` vis-à-vis d'`analysis` : Export ne
 * dépend jamais directement du module Deliverables (créerait un cycle Nest, Deliverables important
 * déjà Export). Un pont `@Global()` côté Deliverables (`ExportThemeResolverBridgeModule`) lie ce
 * token à `TemplateThemeResolverService.resolveTheme` (Sprint 8A.1, réutilisé tel quel — jamais un
 * second calcul de la hiérarchie TENDER > CLIENT > ORGANIZATION > TENDEROS).
 */
export interface ThemeResolver {
  resolveActive(input: { organizationId: string; clientAccountId: string; tenderId: string }): Promise<ResolvedExportTheme | null>;
  /** Mission Sprint 8A.2 — un export FINAL réutilise TOUJOURS le thème déjà figé sur l'aperçu
   *  approuvé (`ExportJob.themeVersionId`), jamais une nouvelle résolution par hiérarchie (mission
   *  §32 "aucune substitution silencieuse d'une version validée" — même discipline déjà appliquée
   *  à `exportTemplateVersionId`). */
  findByVersionId(input: { organizationId: string; versionId: string }): Promise<ResolvedExportTheme | null>;
}

export const THEME_RESOLVER = Symbol("EXPORT_THEME_RESOLVER");
