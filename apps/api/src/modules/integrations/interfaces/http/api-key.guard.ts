import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthenticateApiKeyUseCase, type ApiKeyPrincipal } from "../../application/use-cases/authenticate-api-key.use-case";

export type RequestWithApiKeyPrincipal = Request & { apiKeyPrincipal?: ApiKeyPrincipal };

/**
 * Mission §9/§72 — auth DISTINCTE du guard de session (`AuthenticatedGuard`, identity module) :
 * la Public API est un principal technique, jamais une session utilisateur. Un seul en-tête
 * `Authorization: Bearer tos_live_...` suffit — l'organisation est dérivée de la clé elle-même
 * (jamais un `X-Organization-Id` séparé à faire correspondre, contrairement au flux session).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authenticateApiKeyUseCase: AuthenticateApiKeyUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiKeyPrincipal>();
    const header = request.header("authorization");

    if (!header || !header.startsWith("Bearer ")) {
      throw this.authenticationRequired();
    }

    const fullKey = header.slice("Bearer ".length).trim();

    try {
      request.apiKeyPrincipal = await this.authenticateApiKeyUseCase.execute(fullKey);
    } catch {
      throw this.authenticationRequired();
    }

    return true;
  }

  private authenticationRequired(): UnauthorizedException {
    return new UnauthorizedException({ error: { code: "API_KEY_AUTHENTICATION_FAILED", message: "Invalid, revoked, or expired API key." } });
  }
}
