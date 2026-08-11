import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ApiKeyPrincipal } from "../../application/use-cases/authenticate-api-key.use-case";
import type { RequestWithApiKeyPrincipal } from "./api-key.guard";

export const CurrentApiKeyPrincipal = createParamDecorator((_: unknown, context: ExecutionContext): ApiKeyPrincipal => {
  const request = context.switchToHttp().getRequest<RequestWithApiKeyPrincipal>();
  if (!request.apiKeyPrincipal) {
    throw new Error("CurrentApiKeyPrincipal used outside of an ApiKeyGuard-protected route.");
  }
  return request.apiKeyPrincipal;
});
