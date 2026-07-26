import { Inject, Injectable } from "@nestjs/common";
import type { UserStatus } from "../../domain/user-status";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type CountUsersByStatusResult = Record<UserStatus, number>;

@Injectable()
export class CountUsersByStatusUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepository) {}

  async execute(): Promise<CountUsersByStatusResult> {
    return this.userRepository.countByStatus();
  }
}
