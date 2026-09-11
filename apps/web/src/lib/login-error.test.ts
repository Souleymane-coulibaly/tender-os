// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeLoginFailure } from "./login-error";

function apiResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("describeLoginFailure", () => {
  it("dit « identifiants incorrects » pour des identifiants refusés", async () => {
    const message = await describeLoginFailure(apiResponse(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } }));
    expect(message).toBe("L'adresse e-mail ou le mot de passe est incorrect.");
  });

  it("ne confond JAMAIS la limite de tentatives avec des identifiants invalides", async () => {
    const message = await describeLoginFailure(apiResponse(429, { error: { code: "TOO_MANY_REQUESTS", message: "ThrottlerException" } }));
    expect(message).toBe("Trop de tentatives. Patientez un instant avant de réessayer.");
    expect(message).not.toMatch(/mot de passe|identifiants/i);
  });

  it("reconnaît la limite de tentatives même sans corps lisible", async () => {
    expect(await describeLoginFailure(apiResponse(429, "Too Many Requests"))).toBe("Trop de tentatives. Patientez un instant avant de réessayer.");
  });

  it("dit qu'un compte est désactivé plutôt que d'accuser le mot de passe", async () => {
    const message = await describeLoginFailure(apiResponse(403, { error: { code: "USER_NOT_ACTIVE", message: "User is not active." } }));
    expect(message).toContain("n'est pas actif");
  });

  it("signale une panne serveur comme telle", async () => {
    expect(await describeLoginFailure(apiResponse(503, "<html>Bad gateway</html>"))).toBe("Une erreur serveur est survenue. Veuillez réessayer.");
  });

  it("ne dit jamais « session expirée » sur l'écran de connexion (401 sans code)", async () => {
    const message = await describeLoginFailure(apiResponse(401, {}));
    expect(message).toBe("L'adresse e-mail ou le mot de passe est incorrect.");
    expect(message).not.toMatch(/session/i);
  });
});
