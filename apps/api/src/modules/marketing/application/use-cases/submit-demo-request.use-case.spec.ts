import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage, EmailProvider } from "../../../../shared-kernel/email-provider";
import { demoRequestEmailTotal } from "../../../../shared-kernel/metrics/metrics";
import { SubmitDemoRequestUseCase } from "./submit-demo-request.use-case";

class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

class FailingEmailProvider implements EmailProvider {
  async send(): Promise<void> {
    throw new Error("simulated Resend failure");
  }
}

describe("SubmitDemoRequestUseCase", () => {
  let emailProvider: FakeEmailProvider;
  let useCase: SubmitDemoRequestUseCase;
  const originalNotifyEmail = process.env.DEMO_REQUEST_NOTIFY_EMAIL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    emailProvider = new FakeEmailProvider();
    useCase = new SubmitDemoRequestUseCase(emailProvider);
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = "sales@tenderos.fr";
  });

  afterEach(() => {
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = originalNotifyEmail;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("sends an email with the submitted fields to the configured destination", async () => {
    await useCase.execute({ name: "Marie Dupont", email: "marie@example.com", company: "ACME BTP", phone: "0600000000", message: "Intéressée par une démo." });

    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0]?.to).toBe("sales@tenderos.fr");
    expect(emailProvider.sent[0]?.html).toContain("Marie Dupont");
    expect(emailProvider.sent[0]?.html).toContain("ACME BTP");
  });

  it("V2 Sprint 23 (landing, anti-spam) — a filled honeypot silently no-ops, never sends an email", async () => {
    await useCase.execute({ name: "Bot", email: "bot@example.com", company: "Spam Inc", honeypot: "http://spam.example" });

    expect(emailProvider.sent).toHaveLength(0);
  });

  it("escapes HTML in submitted fields (never inject raw markup into the notification email)", async () => {
    await useCase.execute({ name: "<script>alert(1)</script>", email: "x@example.com", company: "Acme" });

    expect(emailProvider.sent[0]?.html).not.toContain("<script>");
    expect(emailProvider.sent[0]?.html).toContain("&lt;script&gt;");
  });

  it("mission §37 — the recipient always comes from configuration, never a hardcoded value", async () => {
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = "another-configured-address@tenderos.fr";
    const scopedUseCase = new SubmitDemoRequestUseCase(emailProvider);

    await scopedUseCase.execute({ name: "Marie", email: "marie@example.com", company: "ACME" });

    expect(emailProvider.sent[0]?.to).toBe("another-configured-address@tenderos.fr");
  });

  it("mission §35/§19 — increments the demo_request_email_total{outcome=\"sent\"} metric on success", async () => {
    const before = (await demoRequestEmailTotal.get()).values.find((v) => v.labels.outcome === "sent")?.value ?? 0;

    await useCase.execute({ name: "Marie", email: "marie@example.com", company: "ACME" });

    const after = (await demoRequestEmailTotal.get()).values.find((v) => v.labels.outcome === "sent")?.value ?? 0;
    expect(after).toBe(before + 1);
  });

  it("mission §36/§17/§18 — an email provider failure propagates cleanly, increments the failed metric, and is never a silent success", async () => {
    const failingUseCase = new SubmitDemoRequestUseCase(new FailingEmailProvider());
    const before = (await demoRequestEmailTotal.get()).values.find((v) => v.labels.outcome === "failed")?.value ?? 0;

    await expect(failingUseCase.execute({ name: "Marie", email: "marie@example.com", company: "ACME" })).rejects.toThrow("simulated Resend failure");

    const after = (await demoRequestEmailTotal.get()).values.find((v) => v.labels.outcome === "failed")?.value ?? 0;
    expect(after).toBe(before + 1);
  });
});

describe("SubmitDemoRequestUseCase — P2 (audit Codex, Resend/Demo Request) fail-fast constructor guard", () => {
  const originalNotifyEmail = process.env.DEMO_REQUEST_NOTIFY_EMAIL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = originalNotifyEmail;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("mission §27 — local (NODE_ENV=development) without DEMO_REQUEST_NOTIFY_EMAIL still constructs (fallback stays allowed)", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEMO_REQUEST_NOTIFY_EMAIL;

    expect(() => new SubmitDemoRequestUseCase(new FakeEmailProvider())).not.toThrow();
  });

  it("mission §28 — test env without DEMO_REQUEST_NOTIFY_EMAIL still constructs", () => {
    process.env.NODE_ENV = "test";
    delete process.env.DEMO_REQUEST_NOTIFY_EMAIL;

    expect(() => new SubmitDemoRequestUseCase(new FakeEmailProvider())).not.toThrow();
  });

  it("BLOQUANT — mission §32 staging without DEMO_REQUEST_NOTIFY_EMAIL refuses to construct, never falls back to contact@tenderos.fr", () => {
    process.env.NODE_ENV = "staging";
    delete process.env.DEMO_REQUEST_NOTIFY_EMAIL;

    expect(() => new SubmitDemoRequestUseCase(new FakeEmailProvider())).toThrow(/DEMO_REQUEST_NOTIFY_EMAIL/);
  });

  it("BLOQUANT — mission §32 production without DEMO_REQUEST_NOTIFY_EMAIL refuses to construct", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DEMO_REQUEST_NOTIFY_EMAIL;

    expect(() => new SubmitDemoRequestUseCase(new FakeEmailProvider())).toThrow(/DEMO_REQUEST_NOTIFY_EMAIL/);
  });

  it("production WITH DEMO_REQUEST_NOTIFY_EMAIL configured constructs normally and sends to it", async () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = "sales@tenderos.fr";
    const emailProvider = new FakeEmailProvider();

    const useCase = new SubmitDemoRequestUseCase(emailProvider);
    await useCase.execute({ name: "Marie", email: "marie@example.com", company: "ACME" });

    expect(emailProvider.sent[0]?.to).toBe("sales@tenderos.fr");
  });
});
