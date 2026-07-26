import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { MembershipContext, RequestWithMembershipContext } from "./organization-membership.guard";

/**
 * À utiliser uniquement sur une route protégée par OrganizationMembershipGuard.
 */
export const CurrentMembershipContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MembershipContext => {
    const request = context.switchToHttp().getRequest<RequestWithMembershipContext>();

    if (!request.membershipContext) {
      throw new Error("CurrentMembershipContext decorator used without OrganizationMembershipGuard.");
    }

    return request.membershipContext;
  },
);
