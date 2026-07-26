import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedActor, RequestWithActor } from "./authenticated.guard";

/**
 * À utiliser uniquement sur une route protégée par AuthenticatedGuard.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<RequestWithActor>();

    if (!request.actor) {
      throw new Error("CurrentActor decorator used without AuthenticatedGuard.");
    }

    return request.actor;
  },
);
