import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";

/**
 * Voir `AtomicTransactionRunner` (port) pour la justification complète — copie du motif
 * `opportunity`/`ai-suggestion-bridge`/`workspace`, avec un correctif Sprint 22B :
 * `CreateTenderUseCase` (ce module) est désormais appelé DEPUIS l'intérieur de la transaction déjà
 * ouverte par `PromoteOpportunityToTenderUseCase` (module `opportunity`, son propre
 * `AtomicTransactionRunner`, même motif). Sans la vérification `TransactionalContext.current()`
 * ci-dessous, `run()` ouvrait TOUJOURS une seconde transaction Postgres INDÉPENDANTE (nouvelle
 * connexion, jamais imbriquée au sens SQL) — la fenêtre TOCTOU que la transaction externe ferme
 * (relecture de la dernière décision + verrou implicite) redevenait franchissable, prouvé par un
 * VRAI doublon de Tender sous promotion concurrente réelle (réaudit — non simulé). Rejoindre la
 * transaction ambiante quand elle existe déjà, plutôt que d'en ouvrir une seconde, est strictement
 * plus sûr dans tous les cas (appel racine ou imbriqué) — jamais une régression pour l'appel racine
 * existant (comportement inchangé : aucune transaction ambiante -> `$transaction` s'exécute
 * exactement comme avant).
 */
@Injectable()
export class PrismaAtomicTransactionRunner implements AtomicTransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const ambient = TransactionalContext.current();
    if (ambient) {
      return fn();
    }
    return this.prisma.$transaction((tx) => TransactionalContext.run(tx, fn));
  }
}
