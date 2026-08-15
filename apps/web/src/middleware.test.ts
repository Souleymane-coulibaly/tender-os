import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { APP_SESSION_COOKIE } from "./lib/app-api-client";
import { PLATFORM_SESSION_COOKIE } from "./lib/platform-api-client";
import { middleware } from "./middleware";

describe("platform-admin middleware", () => {
  it("lets the login page through without a session cookie", () => {
    const request = new NextRequest(new URL("http://localhost:3000/platform-admin/login"));

    const response = middleware(request);

    expect(response.status).toBe(200);
  });

  it("redirects to the login page when no session cookie is present", () => {
    const request = new NextRequest(new URL("http://localhost:3000/platform-admin/organizations"));

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/platform-admin/login");
  });

  it("lets the request through when a session cookie is present", () => {
    const request = new NextRequest(new URL("http://localhost:3000/platform-admin/organizations"), {
      headers: { cookie: `${PLATFORM_SESSION_COOKIE}=some-token` },
    });

    const response = middleware(request);

    expect(response.status).toBe(200);
  });

  it("does not interfere with routes outside /platform-admin", () => {
    const request = new NextRequest(new URL("http://localhost:3000/"));

    const response = middleware(request);

    expect(response.status).toBe(200);
  });
});

describe("app middleware", () => {
  it("redirects to /app/login when no session cookie is present", () => {
    const request = new NextRequest(new URL("http://localhost:3000/app/tenders"));

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/app/login");
  });

  it("lets the request through when a session cookie is present", () => {
    const request = new NextRequest(new URL("http://localhost:3000/app/tenders"), {
      headers: { cookie: `${APP_SESSION_COOKIE}=some-token` },
    });

    const response = middleware(request);

    expect(response.status).toBe(200);
  });

  it("lets /app/login through without a session cookie", () => {
    const request = new NextRequest(new URL("http://localhost:3000/app/login"));

    const response = middleware(request);

    expect(response.status).toBe(200);
  });

  it("V2 Sprint 24 — lets /app/forgot-password and /app/reset-password through without a session cookie (a user who forgot their password is, by definition, logged out)", () => {
    const forgotPassword = middleware(new NextRequest(new URL("http://localhost:3000/app/forgot-password")));
    const resetPassword = middleware(new NextRequest(new URL("http://localhost:3000/app/reset-password?token=abc")));

    expect(forgotPassword.status).toBe(200);
    expect(resetPassword.status).toBe(200);
  });

  it("does not exempt other /app sub-paths named similarly (no accidental prefix match)", () => {
    const request = new NextRequest(new URL("http://localhost:3000/app/forgot-password-something-else"));

    const response = middleware(request);

    expect(response.status).toBe(307);
  });
});
