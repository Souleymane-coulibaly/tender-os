import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient, type Prisma } from "@prisma/client";
import { TransactionalContext } from "./transactional-context";

/**
 * Point d'accès unique à Prisma (skills/platform-foundation/DATABASE_PATTERNS.md §71).
 * Aucun autre composant n'instancie PrismaClient directement.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** V2 Sprint 4 (audit Codex P1-001, round 4) — retourne la transaction ambiante active
   *  (`TransactionalContext`) si présente, sinon ce client lui-même. Seuls les repositories qui
   *  appellent explicitement `this.prisma.currentClient()` (au lieu de `this.prisma`) participent
   *  au mécanisme — jamais un changement de comportement pour le reste du codebase.
   *
   *  MÉTHODE, jamais un accesseur (`get`) : le client Prisma généré s'appuie en interne sur un
   *  Proxy (pour `$extends`/l'accès dynamique aux modèles) qui n'invoque pas toujours les
   *  accesseurs hérités avec le bon `this` (piège classique `Reflect.get(target, prop, receiver)`
   *  côté Proxy) — vérifié empiriquement : un `get currentClient()` renvoyait `undefined` en
   *  production alors qu'un appel de méthode ordinaire (`this` toujours lié par la syntaxe
   *  `obj.method()`, indépendamment du Proxy) fonctionne de façon fiable. */
  currentClient(): PrismaClient | Prisma.TransactionClient {
    return TransactionalContext.current() ?? this;
  }

  /** Exécute `fn` de façon atomique : rejoint la transaction ambiante déjà active si présente
   *  (jamais de transaction imbriquée indépendante), sinon en ouvre une nouvelle localement — pour
   *  tout repository qui a par ailleurs besoin d'atomicité multi-étapes propre à sa méthode (verrou
   *  consultatif, agrégation puis écriture...), compatible avec le contexte ambiant P1-001. */
  async withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const ambient = TransactionalContext.current();
    if (ambient) {
      return fn(ambient);
    }
    return this.$transaction(fn);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(
        "Impossible de se connecter à la base de données au démarrage ; le serveur démarre quand même (liveness indépendante de la readiness DB). Les requêtes dépendant de la base échoueront tant que la connexion n'est pas rétablie.",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma disconnected");
  }
}
