import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedActor } from "../../../identity";
import {
  PLATFORM_ADMINISTRATOR_REPOSITORY,
  type PlatformAdministratorRepository,
} from "../../application/ports/platform-administrator.repository";
import type { PlatformRole } from "../../domain/platform-role";

export type PlatformContext = {
  administratorId: string;
  role: PlatformRole;
};

export type RequestWithPlatformContext = Request & {
  actor?: AuthenticatedActor;
  platformContext?: PlatformContext;
};

/**
 * Vérification générique — authentification déjà faite par AuthenticatedGuard, ce guard
 * vérifie uniquement la présence d'un enregistrement PlatformAdministrator pour l'acteur
 * (deny by default : un OWNER/ADMIN d'organisation cliente n'obtient jamais cet accès,
 * puisque ce mécanisme est entièrement distinct de Memberships). Les vérifications de
 * capacité fine restent dans le use case (policy).
 */
@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(
    @Inject(PLATFORM_ADMINISTRATOR_REPOSITORY)
    private readonly platformAdministratorRepository: PlatformAdministratorRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPlatformContext>();
    const actor = request.actor;

    if (!actor) {
      throw new Error("PlatformAccessGuard used without AuthenticatedGuard.");
    }

    const administrator = await this.platformAdministratorRepository.findByUserId(actor.userId);

    if (!administrator) {
      throw new ForbiddenException({
        error: {
          code: "PLATFORM_ACCESS_DENIED",
          message: "This actor does not have platform administration access.",
        },
      });
    }

    request.platformContext = {
      administratorId: administrator.id.value,
      role: administrator.role,
    };

    return true;
  }
}
