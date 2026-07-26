import { Inject, Injectable } from "@nestjs/common";
import { UserNotFoundError } from "../../domain/errors";
import { UserId } from "../../domain/user-id.value-object";
import { toUserSummary, type UserSummary } from "../dtos";
import { USER_REPOSITORY, type UserRepository } from "../ports/user.repository";

export type GetCurrentUserQuery = Readonly<{
  userId: string;
}>;

export type GetCurrentUserResult = UserSummary;

@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepository) {}

  async execute(query: GetCurrentUserQuery): Promise<GetCurrentUserResult> {
    const user = await this.userRepository.findById(UserId.from(query.userId));

    if (!user) {
      throw new UserNotFoundError();
    }

    return toUserSummary(user);
  }
}
