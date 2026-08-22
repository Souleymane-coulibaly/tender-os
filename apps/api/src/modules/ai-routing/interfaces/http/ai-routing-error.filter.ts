import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  AI_ROUTING_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  UNKNOWN_AI_TASK_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INCOMPATIBLE_MODEL_OVERRIDE: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class AiRoutingErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({ error: { code: exception.code, message: exception.message, requestId: request.id } });
  }
}
