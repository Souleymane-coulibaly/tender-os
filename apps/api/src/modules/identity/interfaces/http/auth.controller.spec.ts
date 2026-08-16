import { describe, expect, it, vi } from "vitest";
import type { AuthenticateUserUseCase } from "../../application/use-cases/authenticate-user.use-case";
import type { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case";
import type { LogoutUserUseCase } from "../../application/use-cases/logout-user.use-case";
import type { RegisterUserUseCase } from "../../application/use-cases/register-user.use-case";
import type { RequestPasswordResetUseCase } from "../../application/use-cases/request-password-reset.use-case";
import type { ResetPasswordUseCase } from "../../application/use-cases/reset-password.use-case";
import type { UpdateTourStateUseCase } from "../../application/use-cases/update-tour-state.use-case";
import type { UserSummary } from "../../application/dtos";
import { AuthController } from "./auth.controller";

const USER_SUMMARY: UserSummary = {
  id: "user-1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  status: "ACTIVE",
  createdAt: "2026-07-25T14:00:00.000Z",
};

function createController(overrides?: {
  registerUserUseCase?: Partial<RegisterUserUseCase>;
  authenticateUserUseCase?: Partial<AuthenticateUserUseCase>;
  logoutUserUseCase?: Partial<LogoutUserUseCase>;
  getCurrentUserUseCase?: Partial<GetCurrentUserUseCase>;
  requestPasswordResetUseCase?: Partial<RequestPasswordResetUseCase>;
  resetPasswordUseCase?: Partial<ResetPasswordUseCase>;
  updateTourStateUseCase?: Partial<UpdateTourStateUseCase>;
}) {
  const registerUserUseCase = {
    execute: vi.fn().mockResolvedValue(USER_SUMMARY),
    ...overrides?.registerUserUseCase,
  } as unknown as RegisterUserUseCase;

  const authenticateUserUseCase = {
    execute: vi.fn().mockResolvedValue({
      accessToken: "token-1",
      expiresAt: "2026-07-25T15:00:00.000Z",
      user: USER_SUMMARY,
    }),
    ...overrides?.authenticateUserUseCase,
  } as unknown as AuthenticateUserUseCase;

  const logoutUserUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.logoutUserUseCase,
  } as unknown as LogoutUserUseCase;

  const getCurrentUserUseCase = {
    execute: vi.fn().mockResolvedValue(USER_SUMMARY),
    ...overrides?.getCurrentUserUseCase,
  } as unknown as GetCurrentUserUseCase;

  const requestPasswordResetUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.requestPasswordResetUseCase,
  } as unknown as RequestPasswordResetUseCase;

  const resetPasswordUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.resetPasswordUseCase,
  } as unknown as ResetPasswordUseCase;

  const updateTourStateUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.updateTourStateUseCase,
  } as unknown as UpdateTourStateUseCase;

  const controller = new AuthController(
    registerUserUseCase,
    authenticateUserUseCase,
    logoutUserUseCase,
    getCurrentUserUseCase,
    requestPasswordResetUseCase,
    resetPasswordUseCase,
    updateTourStateUseCase,
  );

  return {
    controller,
    registerUserUseCase,
    authenticateUserUseCase,
    logoutUserUseCase,
    getCurrentUserUseCase,
    requestPasswordResetUseCase,
    resetPasswordUseCase,
  };
}

describe("AuthController", () => {
  it("register delegates to RegisterUserUseCase and returns a bare user object", async () => {
    const { controller, registerUserUseCase } = createController();

    const response = await controller.register({
      email: "Ada@Example.com",
      password: "correct-horse-battery-staple",
      displayName: "Ada Lovelace",
      termsAccepted: true,
    });

    expect(registerUserUseCase.execute).toHaveBeenCalledWith({
      email: "Ada@Example.com",
      password: "correct-horse-battery-staple",
      displayName: "Ada Lovelace",
      termsAccepted: true,
    });
    expect(response).toEqual(USER_SUMMARY);
    expect(response).not.toHaveProperty("data");
  });

  it("login delegates to AuthenticateUserUseCase and returns the access token", async () => {
    const { controller } = createController();

    const response = await controller.login({
      email: "ada@example.com",
      password: "correct-horse-battery-staple",
    });

    expect(response.accessToken).toBe("token-1");
    expect(response.user).toEqual(USER_SUMMARY);
  });

  it("logout delegates to LogoutUserUseCase with the actor's session", async () => {
    const { controller, logoutUserUseCase } = createController();

    await controller.logout({ userId: "user-1", sessionId: "session-1" });

    expect(logoutUserUseCase.execute).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("me delegates to GetCurrentUserUseCase with the actor's id", async () => {
    const { controller, getCurrentUserUseCase } = createController();

    const response = await controller.me({ userId: "user-1", sessionId: "session-1" });

    expect(getCurrentUserUseCase.execute).toHaveBeenCalledWith({ userId: "user-1" });
    expect(response).toEqual(USER_SUMMARY);
  });

  it("forgotPassword delegates to RequestPasswordResetUseCase and returns no body (anti-enumeration)", async () => {
    const { controller, requestPasswordResetUseCase } = createController();

    const response = await controller.forgotPassword({ email: "ada@example.com" });

    expect(requestPasswordResetUseCase.execute).toHaveBeenCalledWith({ email: "ada@example.com" });
    expect(response).toBeUndefined();
  });

  it("resetPassword delegates to ResetPasswordUseCase", async () => {
    const { controller, resetPasswordUseCase } = createController();

    await controller.resetPassword({ token: "raw-token", newPassword: "correct-horse-battery-staple" });

    expect(resetPasswordUseCase.execute).toHaveBeenCalledWith({
      token: "raw-token",
      newPassword: "correct-horse-battery-staple",
    });
  });
});
