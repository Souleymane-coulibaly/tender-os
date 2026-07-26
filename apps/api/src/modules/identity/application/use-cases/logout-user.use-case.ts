import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { SESSION_REPOSITORY, type SessionRepository } from "../ports/session.repository";

export type LogoutCommand = Readonly<{
  sessionId: string;
}>;

/**
 * Idempotent : révoquer une session déjà révoquée ou inexistante ne produit pas d'erreur
 * (skills/platform-foundation/ARCHITECTURE_RULES.md — idempotence des opérations rejouables).
 */
@Injectable()
export class LogoutUserUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepository: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    const session = await this.sessionRepository.findById(command.sessionId);

    if (!session) {
      return;
    }

    session.revoke(this.clock.now());
    await this.sessionRepository.save(session);
  }
}
