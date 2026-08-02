import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared-kernel/domain-error";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";

const STATUS_BY_CODE: Record<string, number> = {
  TENDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_PERMISSION_MISSING: HttpStatus.FORBIDDEN,
  EXPORT_JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXPORT_ARTIFACT_NOT_FOUND: HttpStatus.NOT_FOUND,

  SUBMISSION_PACKAGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PACKAGE_NOT_READY: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_ARCHIVE_PATH: HttpStatus.CONFLICT,
  UNSAFE_ARCHIVE_PATH: HttpStatus.BAD_REQUEST,
};

@Catch(DomainError)
export class SubmissionPackageErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({ error: { code: exception.code, message: exception.message, requestId: request.id } });
  }
}
