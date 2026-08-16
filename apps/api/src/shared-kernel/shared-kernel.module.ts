import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { CLOCK, SystemClock } from "./clock";
import { EMAIL_PROVIDER, type EmailProvider } from "./email-provider";
import { resolveEmailProviderKind } from "./email-config";
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
 * `notifications` — voir `email-provider.ts`) — P2 (audit Codex, Resend/Demo Request) : la
 * sélection passe par `resolveEmailProviderKind()` (voir `email-config.ts`), qui REFUSE tout
 * basculement silencieux vers `LoggingEmailProvider` hors local/test — en staging/production sans
 * Resend correctement configuré, cette factory lève, ce qui fait échouer la résolution du graphe
 * DI et donc le démarrage de l'application (fail-fast au boot, jamais un premier lead perdu avant
 * découverte). `ResendEmailProvider`/`LoggingEmailProvider` restent tous deux listés comme
 * providers bruts (aucun des deux ne valide quoi que ce soit dans son propre constructeur — la
 * lecture de `RESEND_API_KEY` se fait dans `send()`, jamais mise en cache), donc les instancier
 * tous les deux ici est sans risque (contrairement au piège d'instanciation DI documenté pour
 * `CloudflareR2StorageProvider`).
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
    {
      provide: EMAIL_PROVIDER,
      useFactory: (resend: ResendEmailProvider, logging: LoggingEmailProvider): EmailProvider => (resolveEmailProviderKind() === "resend" ? resend : logging),
      inject: [ResendEmailProvider, LoggingEmailProvider],
    },
  ],
  exports: [CLOCK, ID_GENERATOR, EMAIL_PROVIDER],
})
export class SharedKernelModule {}
