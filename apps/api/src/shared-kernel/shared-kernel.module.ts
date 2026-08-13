import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { CLOCK, SystemClock } from "./clock";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { ID_GENERATOR, UuidGenerator } from "./id-generator";
import { MetricsHttpInterceptor } from "./metrics/metrics-http.interceptor";

/**
 * Primitives transversales (Clock, IdGenerator) — skills/platform-foundation/ARCHITECTURE_RULES.md §36.
 * Sprint 21 (hardening) — `GlobalExceptionFilter`/`MetricsHttpInterceptor` enregistrés ici via
 * `APP_FILTER`/`APP_INTERCEPTOR` (jamais dans main.ts) : ce module est déjà `@Global()` et importé
 * une seule fois, cohérent avec le reste des primitives transversales de ce fichier.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsHttpInterceptor },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class SharedKernelModule {}
