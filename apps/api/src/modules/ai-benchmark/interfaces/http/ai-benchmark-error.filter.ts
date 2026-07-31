import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  AI_MODEL_NOT_FOUND: HttpStatus.NOT_FOUND,
  DUPLICATE_AI_MODEL: HttpStatus.CONFLICT,
  MODEL_KEY_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_MODEL_NOT_ENABLED_FOR_BENCHMARK: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_MODEL_DISABLED: HttpStatus.UNPROCESSABLE_ENTITY,
  PRICING_SNAPSHOT_OVERLAP: HttpStatus.CONFLICT,
  PRICING_SNAPSHOT_NOT_FOUND: HttpStatus.NOT_FOUND,
  BENCHMARK_SUITE_NOT_FOUND: HttpStatus.NOT_FOUND,
  BENCHMARK_SUITE_NOT_DRAFT: HttpStatus.CONFLICT,
  BENCHMARK_SUITE_EMPTY: HttpStatus.UNPROCESSABLE_ENTITY,
  BENCHMARK_RUN_NOT_FOUND: HttpStatus.NOT_FOUND,
  BENCHMARK_RUN_NOT_CANCELLABLE: HttpStatus.CONFLICT,
  BENCHMARK_RUN_MODEL_NOT_ELIGIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_BENCHMARK_RUN_PARAMETERS: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_BENCHMARK_RUN_STATUS_TRANSITION: HttpStatus.CONFLICT,
  BENCHMARK_COST_CEILING_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  BENCHMARK_RUN_NOT_COMPLETED: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_ADMISSIBLE_MODEL: HttpStatus.UNPROCESSABLE_ENTITY,
  MODEL_RECOMMENDATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MODEL_RECOMMENDATION_NOT_DRAFT: HttpStatus.CONFLICT,
  ROUTING_POLICY_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_ROUTING_POLICY_STATUS_TRANSITION: HttpStatus.CONFLICT,
  ROUTING_POLICY_ACTIVATION_CONFLICT: HttpStatus.CONFLICT,
  ROUTING_POLICY_MODEL_NOT_ELIGIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  BENCHMARK_RUN_STALE_RECOVERY_EXHAUSTED: HttpStatus.CONFLICT,
  AI_BENCHMARK_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class AiBenchmarkErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      error: { code: exception.code, message: exception.message, requestId: request.id },
    });
  }
}
