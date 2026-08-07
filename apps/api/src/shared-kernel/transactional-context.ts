import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";

export type AmbientTransactionClient = Prisma.TransactionClient;

/**
 * Contexte transactionnel ambiant (AsyncLocalStorage) — introduit spécifiquement pour fermer
 * l'écart d'atomicité P1-001 (bridge AiSuggestion -> Tenders/Buyer, voir
 * `ApplyAiSuggestionUseCase`/`PrismaAtomicTransactionRunner`) : PAS une infra générale imposée à
 * tout le codebase. Quand `run` est actif, tout repository Prisma qui consulte
 * `PrismaService.currentClient()` (au lieu d'utiliser `this.prisma` directement) rejoint
 * AUTOMATIQUEMENT la même transaction Postgres, sans qu'aucune signature publique de use case ou
 * de port ne soit modifiée pour faire transiter un `tx` explicitement à travers la chaîne
 * d'appels. Seuls les repositories qui optent explicitement pour `currentClient()` y participent —
 * un repository qui continue d'utiliser `this.prisma` reste totalement indifférent à ce mécanisme.
 */
export class TransactionalContext {
  private static readonly storage = new AsyncLocalStorage<AmbientTransactionClient>();

  /** Exécute `fn` avec `tx` comme contexte ambiant pour toute la durée de l'appel — y compris à
   *  travers des frontières `await` et des couches d'injection de dépendances arbitrairement
   *  profondes (AsyncLocalStorage garantit la propagation, contrairement à une variable module). */
  static run<T>(tx: AmbientTransactionClient, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, fn);
  }

  /** `undefined` hors de tout `run()` actif — c'est le cas normal pour la quasi-totalité des
   *  requêtes de l'application, qui n'ont jamais besoin de ce mécanisme. */
  static current(): AmbientTransactionClient | undefined {
    return this.storage.getStore();
  }
}
