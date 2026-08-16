import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendEmailProvider } from "./resend-email.provider";

const ORIGINAL_ENV = { ...process.env };

describe("ResendEmailProvider — P2 (audit Codex, Resend/Demo Request)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("uses RESEND_FROM_EMAIL as the sender and RESEND_API_KEY as the bearer token", async () => {
    process.env.RESEND_API_KEY = "re_test_secret_value";
    process.env.RESEND_FROM_EMAIL = "notifications@tenderos.example";
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));

    const provider = new ResendEmailProvider();
    await provider.send({ to: "lead@example.com", subject: "Sujet", html: "<p>x</p>", text: "x" });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_secret_value");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("notifications@tenderos.example");
    expect(body.to).toEqual(["lead@example.com"]);
  });

  it("BLOQUANT — throws explicitly (never a silent success) when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_EMAIL = "notifications@tenderos.example";
    const provider = new ResendEmailProvider();

    await expect(provider.send({ to: "lead@example.com", subject: "s", html: "h", text: "t" })).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("BLOQUANT — mission §39: the API key never appears in a thrown error message", async () => {
    process.env.RESEND_API_KEY = "re_super_secret_value";
    process.env.RESEND_FROM_EMAIL = "notifications@tenderos.example";
    fetchSpy.mockResolvedValueOnce(new Response("Internal error", { status: 500 }));
    const provider = new ResendEmailProvider();

    try {
      await provider.send({ to: "lead@example.com", subject: "s", html: "h", text: "t" });
      expect.fail("expected send() to throw");
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).not.toContain("re_super_secret_value");
    }
  });

  it("propagates a clean error on a non-2xx Resend response (never a false success)", async () => {
    process.env.RESEND_API_KEY = "re_test_secret_value";
    process.env.RESEND_FROM_EMAIL = "notifications@tenderos.example";
    fetchSpy.mockResolvedValueOnce(new Response("bad request", { status: 422 }));
    const provider = new ResendEmailProvider();

    await expect(provider.send({ to: "lead@example.com", subject: "s", html: "h", text: "t" })).rejects.toThrow(/422/);
  });
});
