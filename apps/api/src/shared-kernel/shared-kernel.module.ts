import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { CLOCK, SystemClock } from "./clock";
import { EMAIL_PROVIDER } from "./email-provider";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { ID_GENERATOR, UuidGenerator } from "./id-generator";
import { LoggingEmailProvider } from "./logging-email.provider";
import { MetricsHttpInterceptor } from "./metrics/metrics-http.interceptor";
import { ResendEmailProvider } from "./resend-email.provider";

/**
 * Primitives transversales (Clock, IdGenerator, EmailProvider) — skills/platform-foundation/
 * ARCHITECTURE_RULES.md §36. Sprint 21 (hardening) — `GlobalExceptionFilter`/
 * `MetricsHttpInterceptor` enregistrés ici via `APP_FILTER`/`APP_INTERCEPTOR` (jamais dans
 * main.ts) : ce module est déjà `@Global()` et importé une seule fois, cohérent avec le reste
 * des primitives transversales de ce fichier. `EMAIL_PROVIDER` (V2 Sprint 24, relocalisé depuis
 * `notifications` — voir `email-provider.ts`) bascule sur `ResendEmailProvider` UNIQUEMENT si
 * `RESEND_API_KEY` est réellement présente au démarrage — sinon `LoggingEmailProvider`.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsHttpInterceptor },
    LoggingEmailProvider,
    ResendEmailProvider,
    { provide: EMAIL_PROVIDER, useClass: process.env.RESEND_API_KEY ? ResendEmailProvider : LoggingEmailProvider },
  ],
  exports: [CLOCK, ID_GENERATOR, EMAIL_PROVIDER],
})
export class SharedKernelModule {}
