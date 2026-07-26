import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { AuthenticatedActor } from "../../../identity";
import { GetOrganizationUseCase, OrganizationStatus } from "../../../organizations";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../../application/ports/membership.repository";
import type { OrganizationRole } from "../../domain/organization-role";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MembershipContext = {
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
};

export type RequestWithMembershipContext = Request & {
  actor?: AuthenticatedActor;
  membershipContext?: MembershipContext;
};

/**
 * Vérification rapide et générique — authentification déjà faite par AuthenticatedGuard,
 * ce guard vérifie uniquement la présence d'une appartenance active à l'organisation
 * ciblée (skills/platform-foundation/ARCHITECTURE_RULES.md §19.3, SECURITY_PATTERNS.md §8).
 * Les vérifications de permission fine restent dans le use case (policy).
 *
 * Le header X-Organization-Id ne constitue jamais une preuve d'autorisation à lui seul
 * (docs/04-architecture/API_GUIDELINES.md §10) — il est toujours revérifié contre une
 * Membership active réelle.
 */
@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMembershipContext>();
    const organizationId = request.header("x-organization-id");

    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      throw new BadRequestException({
        error: {
          code: "ORGANIZATION_ID_HEADER_REQUIRED",
          message: "A valid X-Organization-Id header is required.",
        },
      });
    }

    const actor = request.actor;

    if (!actor) {
      throw new Error("OrganizationMembershipGuard used without AuthenticatedGuard.");
    }

    const membership = await this.membershipRepository.findByOrganizationAndUser({
      organizationId,
      userId: actor.userId,
    });

    if (!membership || !membership.isEffectivelyActive(this.clock.now())) {
      // 404 plutôt que 403 : ne révèle jamais qu'une organisation existe à un acteur qui
      // n'en est pas membre (docs/04-architecture/API_GUIDELINES.md §14).
      throw new NotFoundException({
        error: {
          code: "ORGANIZATION_ACCESS_DENIED",
          message: "Organization not found or not accessible.",
        },
      });
    }

    // Une organisation suspendue/fermée bloque l'accès de ses membres (mission Platform
    // Administration — "empêcher les accès concernés"). Vérifié via l'API publique
    // d'Organizations plutôt qu'en lisant sa table directement (frontière de module).
    const organization = await this.tryGetOrganization(organizationId);

    if (!organization || organization.status === OrganizationStatus.Suspended) {
      throw new NotFoundException({
        error: {
          code: "ORGANIZATION_ACCESS_DENIED",
          message: "Organization not found or not accessible.",
        },
      });
    }

    request.membershipContext = {
      organizationId,
      membershipId: membership.id.value,
      role: membership.role,
    };

    return true;
  }

  private async tryGetOrganization(organizationId: string) {
    try {
      return await this.getOrganizationUseCase.execute({ id: organizationId });
    } catch {
      return null;
    }
  }
}
