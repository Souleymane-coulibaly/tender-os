import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
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
