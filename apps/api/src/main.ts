import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { loadDceConfig } from "./modules/dce/infrastructure/dce-config";
import { loadExtractionConfig } from "./modules/extraction/infrastructure/extraction-config";
import { getRequiredEnv } from "./shared-kernel/env";
import { StructuredLoggerService } from "./shared-kernel/logging/structured-logger.service";
import { requestIdMiddleware } from "./shared-kernel/request-id.middleware";

function assertRequiredEnv(): void {
  getRequiredEnv("DATABASE_URL");
  getRequiredEnv("AUTH_SECRET");
  // Échec précoce et explicite (mission P1-4) — DceModule revalide la même configuration via sa
  // propre factory DI, mais un échec ici survient avant même que NestFactory.create() ne
  // commence à construire le graphe de dépendances.
  loadDceConfig();
  // Mission Sprint 3 §20 — même stratégie, ExtractionModule revalide via sa propre factory DI.
  loadExtractionConfig();
}

async function bootstrap(): Promise<void> {
  assertRequiredEnv();

  // Mission Sprint 8A bis §44/§45 — le webhook Universign vérifie une JWS détachée calculée sur le
  // corps HTTP brut EXACT reçu sur le fil ; `rawBody: true` fait conserver ce buffer par Nest
  // (accessible via `RawBodyRequest<Request>.rawBody`) SANS désactiver le parsing JSON global dont
  // dépendent toutes les autres routes déjà validées (Sprints 0-7).
  // Sprint 21 (hardening) — mission §49/§50/§51/§52 : sortie JSON structurée (jamais le texte
  // libre par défaut de Nest) dès le tout premier log de bootstrap, avec rédaction des secrets
  // (voir structured-logger.service.ts/log-redaction.ts) — passé à la création, pas via
  // `app.useLogger()` après coup, pour couvrir aussi les logs d'initialisation des modules.
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: new StructuredLoggerService() });

  // Sprint 21 (hardening) — sans cet appel, TOUS les hooks `onModuleDestroy` déjà écrits (workers
  // Outbox/webhooks/market-watch, `PrismaService.$disconnect()`) restent du code mort : Nest
  // n'écoute `SIGTERM`/`SIGINT` et n'exécute ces hooks QUE si `enableShutdownHooks()` est appelé
  // explicitement. Sans lui, un redéploiement (Railway envoie SIGTERM) tue le process immédiatement
  // — workers interrompus en plein tick, appels HTTP sortants coupés en vol, connexion Postgres
  // fermée sans `$disconnect()` propre.
  app.enableShutdownHooks();

  // Sprint 21 (hardening) — API JSON pure, jamais de HTML servi ici : la CSP par défaut de Helmet
  // (pensée pour des pages rendues) n'a aucune cible utile et risquerait de gêner un futur usage
  // sans bénéfice de sécurité réel côté API ; désactivée explicitement, jamais implicitement. Les
  // autres en-têtes (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) restent actifs.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  // Sprint 21 (hardening) — mission §32 : politique CORS EXPLICITE plutôt qu'accidentelle.
  // Architecture BFF (Next.js côté serveur appelle l'API, jamais le navigateur directement — voir
  // `apps/web/src/app/**/*-actions.ts`) : aucune requête cross-origin légitime n'existe depuis un
  // navigateur. `origin: false` désactive complètement CORS (aucun en-tête `Access-Control-*`
  // renvoyé) — comportement STRICTEMENT identique à l'absence totale de `enableCors()` jusqu'ici,
  // désormais documenté comme un choix plutôt qu'un oubli. À revisiter explicitement si un jour un
  // client navigateur légitime doit appeler l'API directement (jamais `origin: true`/`*`, jamais
  // avec `credentials: true` combiné à un wildcard — mission §32 "jamais * avec credentials").
  app.enableCors({ origin: false });

  app.use(requestIdMiddleware);
  // /health reste hors versionnement (contrat fixé par la fondation technique). Sprint 21
  // (hardening) — /metrics rejoint cette exception : un endpoint d'exploitation scrapé par de
  // l'outillage infra, jamais une route métier versionnée.
  app.setGlobalPrefix("api/v1", { exclude: ["health", "metrics"] });

  // PORT (fourni par Railway) prime sur API_PORT (développement local) — fallback 4000.
  // Ne jamais fixer PORT manuellement dans Railway : la plateforme l'injecte elle-même.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  // Écoute explicite sur toutes les interfaces — nécessaire pour que le proxy Railway
  // atteigne le conteneur (le binding par défaut de Node peut se limiter à ::1/127.0.0.1
  // selon l'environnement).
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
