import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Validation à la frontière HTTP (skills/platform-foundation/API_PATTERNS.md §22).
 * Générique et sans logique métier — partagé par tous les modules plutôt que dupliqué.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_FAILED",
          message: "The request contains invalid fields.",
          details: {
            fields: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
              message: issue.message,
            })),
          },
        },
      });
    }

    return result.data;
  }
}
