import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";

/** Voir `AtomicTransactionRunner` (port) pour la justification complète — copie exacte du motif
 *  `tenders`/`opportunity`/`ai-suggestion-bridge`/`workspace` : rejoint la transaction ambiante
 *  quand elle existe déjà, plutôt que d'en ouvrir une seconde indépendante. */
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
