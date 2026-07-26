import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { Clock } from "../../../../shared-kernel/clock";
import {
  ACCESS_TOKEN_SERVICE,
  type AccessTokenService,
} from "../../application/ports/access-token.service";
import { SESSION_REPOSITORY, type SessionRepository } from "../../application/ports/session.repository";

export type AuthenticatedActor = {
  userId: string;
  sessionId: string;
};

export type RequestWithActor = Request & { actor?: AuthenticatedActor };

/**
 * Vérifie le jeton d'accès (signature + expiration) puis que la session serveur
 * associée n'a pas été révoquée (défense en profondeur — logout doit réellement
 * invalider un jeton encore valide en apparence).
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokenService: AccessTokenService,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const header = request.header("authorization");

    if (!header || !header.startsWith("Bearer ")) {
      throw this.authenticationRequired();
    }

    const token = header.slice("Bearer ".length);
    const claims = this.accessTokenService.verify(token);

    if (!claims) {
      throw this.authenticationRequired();
    }

    const session = await this.sessionRepository.findById(claims.sessionId);

    if (!session || !session.isValid(this.clock.now())) {
      throw this.authenticationRequired();
    }

    request.actor = { userId: claims.userId, sessionId: claims.sessionId };

    return true;
  }

  private authenticationRequired(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
      },
    });
  }
}
