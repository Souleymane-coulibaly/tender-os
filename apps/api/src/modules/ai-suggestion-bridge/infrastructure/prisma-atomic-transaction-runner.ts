import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { TransactionalContext } from "../../../shared-kernel/transactional-context";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";

/** Voir `AtomicTransactionRunner` (port) pour la justification complète. Ouvre une transaction
 *  Postgres courte via `PrismaService.$transaction` et y établit le contexte transactionnel
 *  ambiant pour toute la durée de `fn` — jamais de transaction imbriquée indépendante : si `fn`
 *  appelle lui-même un repository qui consulte `TransactionalContext`, il rejoint CETTE même
 *  transaction. */
@Injectable()
export class PrismaAtomicTransactionRunner implements AtomicTransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => TransactionalContext.run(tx, fn));
  }
}
