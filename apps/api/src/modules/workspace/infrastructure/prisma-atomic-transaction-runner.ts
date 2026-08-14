import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";

/** Voir `AtomicTransactionRunner` (port) pour la justification complète — copie exacte du motif
 *  `opportunity`/`ai-suggestion-bridge`. */
@Injectable()
export class PrismaAtomicTransactionRunner implements AtomicTransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    // Correctif Sprint 22B — voir `tenders/infrastructure/prisma-atomic-transaction-runner.ts` pour
    // la justification complète (doublon réel prouvé sous transaction imbriquée non détectée).
    const ambient = TransactionalContext.current();
    if (ambient) {
      return fn();
    }
    return this.prisma.$transaction((tx) => TransactionalContext.run(tx, fn));
  }
}
