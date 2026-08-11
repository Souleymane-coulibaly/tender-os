import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { RequestWithApiKeyPrincipal } from "./api-key.guard";

/** Mission §63/§64/§65 — Public API rate-limited PAR CLÉ (jamais seulement globalement/par IP) :
 *  `ApiKeyGuard` doit s'exécuter AVANT ce guard (ordre des décorateurs `@UseGuards`) pour que
 *  `req.apiKeyPrincipal` soit déjà résolu. Fallback IP uniquement si, par construction, aucune clé
 *  n'a pu être résolue (ne devrait jamais arriver derrière `ApiKeyGuard`, défense en profondeur). */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: RequestWithApiKeyPrincipal): Promise<string> {
    return req.apiKeyPrincipal?.apiKeyId ?? req.ip ?? "unknown";
  }
}
