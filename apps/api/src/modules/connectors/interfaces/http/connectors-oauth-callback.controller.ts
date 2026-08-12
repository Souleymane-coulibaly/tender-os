import { Controller, Get, Param, Query, Res, UseFilters } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import { HandleOAuthCallbackUseCase } from "../../application/use-cases/handle-oauth-callback.use-case";
import { ConnectorsErrorFilter } from "./connectors-error.filter";
import { OAuthCallbackQuerySchema } from "./schemas";

function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

/**
 * Mission §6/§54 — endpoint appelé DIRECTEMENT par le navigateur suite à la redirection Microsoft/
 * Google, JAMAIS derrière `AuthenticatedGuard`/`OrganizationMembershipGuard` (le navigateur ne
 * porte aucun Bearer token vers ce endpoint — voir le commentaire de sécurité dans
 * `HandleOAuthCallbackUseCase`). Toujours une redirection HTTP vers le frontend en sortie (jamais
 * un JSON brut affiché au navigateur), succès ou échec — mission §9 : cette URL de redirection
 * finale est TOUJOURS `APP_BASE_URL` + un chemin fixe, jamais construite depuis une valeur de la
 * requête entrante.
 */
@Controller("connectors/oauth")
@UseFilters(ConnectorsErrorFilter)
export class ConnectorsOAuthCallbackController {
  constructor(private readonly handleOAuthCallbackUseCase: HandleOAuthCallbackUseCase) {}

  // `:provider` sert uniquement au routage (une URL de callback distincte par provider, telle
  // qu'enregistrée dans chaque console OAuth Microsoft/Google) — l'identité réelle du provider
  // pour toute décision de sécurité vient de `flowState.provider` (résolu depuis `state` à
  // l'intérieur du use-case), jamais de ce segment d'URL.
  @Get(":provider/callback")
  async callback(@Param("provider") _providerParam: string, @Query() rawQuery: Record<string, unknown>, @Res() response: Response): Promise<void> {
    const query = OAuthCallbackQuerySchema.safeParse(rawQuery);

    if (!query.success || query.data.error || !query.data.code) {
      response.redirect(302, `${appBaseUrl()}/app/integrations/connectors?connectorError=oauth_failed`);
      return;
    }

    try {
      await this.handleOAuthCallbackUseCase.execute({ state: query.data.state, code: query.data.code });
      response.redirect(302, `${appBaseUrl()}/app/integrations/connectors?connectorConnected=1`);
    } catch (error) {
      const code = error instanceof DomainError ? error.code : "UNKNOWN";
      response.redirect(302, `${appBaseUrl()}/app/integrations/connectors?connectorError=${encodeURIComponent(code)}`);
    }
  }
}
