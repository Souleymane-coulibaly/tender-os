import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { getRequiredEnv } from "../../shared-kernel/env";
import { ACCESS_TOKEN_SERVICE } from "./application/ports/access-token.service";
import { PASSWORD_HASHER } from "./application/ports/password-hasher";
import { PASSWORD_RESET_TOKEN_REPOSITORY } from "./application/ports/password-reset-token.repository";
import { SESSION_REPOSITORY } from "./application/ports/session.repository";
import { USER_REPOSITORY } from "./application/ports/user.repository";
import { AuthenticateUserUseCase } from "./application/use-cases/authenticate-user.use-case";
import { CountUsersByStatusUseCase } from "./application/use-cases/count-users-by-status.use-case";
import { GetCurrentUserUseCase } from "./application/use-cases/get-current-user.use-case";
import { ListUsersUseCase } from "./application/use-cases/list-users.use-case";
import { LogoutUserUseCase } from "./application/use-cases/logout-user.use-case";
import { RegisterUserUseCase } from "./application/use-cases/register-user.use-case";
import { RequestPasswordResetUseCase } from "./application/use-cases/request-password-reset.use-case";
import { ResetPasswordUseCase } from "./application/use-cases/reset-password.use-case";
import { JwtAccessTokenService } from "./infrastructure/jwt-access-token.service";
import { PrismaPasswordResetTokenRepository } from "./infrastructure/prisma-password-reset-token.repository";
import { PrismaSessionRepository } from "./infrastructure/prisma-session.repository";
import { PrismaUserRepository } from "./infrastructure/prisma-user.repository";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password-hasher";
import { AuthController } from "./interfaces/http/auth.controller";
import { AuthenticatedGuard } from "./interfaces/http/authenticated.guard";
import { AuthThrottlerGuard } from "./interfaces/http/auth-throttler.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: getRequiredEnv("AUTH_SECRET"),
    }),
    // Sprint 21 (hardening) — mission §23, brute-force/credential-stuffing sur /auth/login et
    // énumération de comptes sur /auth/register (aucune limite n'existait). Volontairement local à
    // ce module (jamais un rate limit global unique, mission §38) — même motif que le throttler
    // "public-api" de IntegrationsModule, chaque module possède son propre stockage/config isolés.
    ThrottlerModule.forRoot([{ name: "auth", ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [
    RegisterUserUseCase,
    AuthenticateUserUseCase,
    LogoutUserUseCase,
    GetCurrentUserUseCase,
    ListUsersUseCase,
    CountUsersByStatusUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    AuthenticatedGuard,
    AuthThrottlerGuard,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JwtAccessTokenService },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: PrismaPasswordResetTokenRepository },
  ],
  // ACCESS_TOKEN_SERVICE et SESSION_REPOSITORY sont exportés uniquement pour que
  // AuthenticatedGuard reste résoluble quand il est réutilisé par un autre module
  // (ex. Organizations) via @UseGuards — ce ne sont pas des points d'extension
  // destinés à être injectés directement ailleurs.
  exports: [
    GetCurrentUserUseCase,
    ListUsersUseCase,
    CountUsersByStatusUseCase,
    AuthenticatedGuard,
    ACCESS_TOKEN_SERVICE,
    SESSION_REPOSITORY,
  ],
})
export class IdentityModule {}
