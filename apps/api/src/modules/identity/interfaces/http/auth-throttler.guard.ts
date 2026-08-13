import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

/** Sprint 21 (hardening) — mission §23 "auditer login/rate limiting, ajouter une protection
 *  raisonnable si absente" : confirmé absente sur `/auth/login`/`/auth/register`. Suivi par IP
 *  (aucun principal authentifié n'existe encore à ce stade, contrairement à `ApiKeyThrottlerGuard`
 *  qui suit par clé API) — jamais un rate limit unique appliqué à toute l'application (mission §38),
 *  seulement ces deux routes sensibles à la force brute/l'énumération de comptes. */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    return req.ip ?? "unknown";
  }
}
