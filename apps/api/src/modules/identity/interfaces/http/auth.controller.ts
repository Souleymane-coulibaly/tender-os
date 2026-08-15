import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticateUserUseCase } from "../../application/use-cases/authenticate-user.use-case";
import { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case";
import { LogoutUserUseCase } from "../../application/use-cases/logout-user.use-case";
import { RegisterUserUseCase } from "../../application/use-cases/register-user.use-case";
import { RequestPasswordResetUseCase } from "../../application/use-cases/request-password-reset.use-case";
import { ResetPasswordUseCase } from "../../application/use-cases/reset-password.use-case";
import { AuthenticatedGuard, type AuthenticatedActor } from "./authenticated.guard";
import { AuthThrottlerGuard } from "./auth-throttler.guard";
import { CurrentActor } from "./current-actor.decorator";
import { IdentityErrorFilter } from "./identity-error.filter";
import { presentAuthentication, presentUser, type AuthenticationResponse, type UserResponse } from "./presenters";
import {
  LoginBodySchema,
  RegisterBodySchema,
  RequestPasswordResetBodySchema,
  ResetPasswordBodySchema,
  type LoginBody,
  type RegisterBody,
  type RequestPasswordResetBody,
  type ResetPasswordBody,
} from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

@Controller("auth")
@UseFilters(IdentityErrorFilter)
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly authenticateUserUseCase: AuthenticateUserUseCase,
    private readonly logoutUserUseCase: LogoutUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthThrottlerGuard)
  async register(
    @Body(new ZodValidationPipe(RegisterBodySchema)) body: RegisterBody,
  ): Promise<UserResponse> {
    const result = await this.registerUserUseCase.execute(body);

    return presentUser(result);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(LoginBodySchema)) body: LoginBody,
  ): Promise<AuthenticationResponse> {
    const result = await this.authenticateUserUseCase.execute(body);

    return presentAuthentication(result);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedGuard)
  async logout(@CurrentActor() actor: AuthenticatedActor): Promise<void> {
    await this.logoutUserUseCase.execute({ sessionId: actor.sessionId });
  }

  @Get("me")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedGuard)
  async me(@CurrentActor() actor: AuthenticatedActor): Promise<UserResponse> {
    const result = await this.getCurrentUserUseCase.execute({ userId: actor.userId });

    return presentUser(result);
  }

  /** V2 Sprint 24 (onboarding, flow "Mot de passe oublié") — 204 systématique, jamais un corps qui
   *  distinguerait "email trouvé" de "email inconnu" (anti-énumération). */
  @Post("forgot-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthThrottlerGuard)
  async forgotPassword(
    @Body(new ZodValidationPipe(RequestPasswordResetBodySchema)) body: RequestPasswordResetBody,
  ): Promise<void> {
    await this.requestPasswordResetUseCase.execute(body);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthThrottlerGuard)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordBodySchema)) body: ResetPasswordBody,
  ): Promise<void> {
    await this.resetPasswordUseCase.execute(body);
  }
}
