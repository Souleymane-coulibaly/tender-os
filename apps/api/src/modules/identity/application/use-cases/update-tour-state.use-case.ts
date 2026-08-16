import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { UserNotFoundError } from "../../domain/errors";
import { UserId } from "../../domain/user-id.value-object";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";
import { toUserSummary, type UserSummary } from "../dtos";

export const TourAction = {
  Start: "START",
  Complete: "COMPLETE",
  Dismiss: "DISMISS",
} as const;
export type TourAction = (typeof TourAction)[keyof typeof TourAction];

export type UpdateTourStateCommand = Readonly<{ userId: string; action: TourAction }>;

/**
 * V2 Sprint 25 (Guide interactif) — mission §25.72/§25.82/§25.83. User-scoped (jamais
 * organization-scoped, aucun `organizationId` dans cette commande) : "Commencer la visite"/"Plus
 * tard"/fin de la dernière étape/"Relancer la visite guidée" appellent tous ce même use case avec
 * l'action correspondante, jamais un second mécanisme de progression persisté côté client au-delà
 * de l'étape courante (qui reste, elle, un état d'affichage éphémère — voir mission §25.87).
 */
@Injectable()
export class UpdateTourStateUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateTourStateCommand): Promise<UserSummary> {
    const user = await this.userRepository.findById(UserId.from(command.userId));
    if (!user) {
      throw new UserNotFoundError();
    }

    const occurredAt = this.clock.now();
    switch (command.action) {
      case TourAction.Start:
        user.startTour(occurredAt);
        break;
      case TourAction.Complete:
        user.completeTour(occurredAt);
        break;
      case TourAction.Dismiss:
        user.dismissTour(occurredAt);
        break;
    }

    await this.userRepository.save(user);
    return toUserSummary(user);
  }
}
