import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";

/** Voir `AtomicTransactionRunner` (port) pour la justification complète — copie exacte du motif
 *  `ai-suggestion-bridge`. */
@Injectable()
export class PrismaAtomicTransactionRunner implements AtomicTransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    // Correctif Sprint 22B — `PromoteOpportunityToTenderUseCase` appelle désormais
    // `CreateTenderUseCase` (module `tenders`) qui possède SA PROPRE instance de ce runner : sans
    // la vérification `TransactionalContext.current()` ci-dessous, l'appel imbriqué ouvrait
    // TOUJOURS une seconde transaction Postgres INDÉPENDANTE (nouvelle connexion, jamais imbriquée
    // au sens SQL), rouvrant la fenêtre TOCTOU que cette transaction externe est censée fermer —
    // prouvé par un VRAI doublon de Tender sous promotion concurrente réelle (réaudit, non simulé).
    // Rejoindre l'ambiante quand elle existe est strictement plus sûr, jamais une régression pour
    // l'appel racine (comportement inchangé : aucune transaction ambiante -> identique à avant).
    const ambient = TransactionalContext.current();
    if (ambient) {
      return fn();
    }
    return this.prisma.$transaction((tx) => TransactionalContext.run(tx, fn));
  }
}
