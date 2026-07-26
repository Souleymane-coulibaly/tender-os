import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { PlatformContext, RequestWithPlatformContext } from "./platform-access.guard";

/**
 * À utiliser uniquement sur une route protégée par PlatformAccessGuard.
 */
export const CurrentPlatformContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformContext => {
    const request = context.switchToHttp().getRequest<RequestWithPlatformContext>();

    if (!request.platformContext) {
      throw new Error("CurrentPlatformContext decorator used without PlatformAccessGuard.");
    }

    return request.platformContext;
  },
);
