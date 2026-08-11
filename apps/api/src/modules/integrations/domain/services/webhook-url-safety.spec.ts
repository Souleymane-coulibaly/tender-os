import { describe, expect, it } from "vitest";
import { UnsafeWebhookEndpointUrlError } from "../errors";
import { assertSafeWebhookEndpointUrl, isDisallowedWebhookHost } from "./webhook-url-safety";

describe("isDisallowedWebhookHost — mission §31/§95 SSRF tests", () => {
  const disallowed = [
    "localhost",
    "sub.localhost",
    "127.0.0.1",
    "127.0.0.53",
    "::1",
    "0.0.0.0",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata service
    "169.254.0.1",
    "fe80::1", // IPv6 link-local
    "fc00::1", // IPv6 unique-local
    "fd12:3456::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1",
    "metadata.google.internal",
    "100.64.0.1", // carrier-grade NAT
  ];

  it.each(disallowed)("rejects %s", (host) => {
    expect(isDisallowedWebhookHost(host)).toBe(true);
  });

  const allowed = ["example.com", "api.n8n.example.org", "8.8.8.8", "1.1.1.1", "203.0.113.10"];

  it.each(allowed)("allows %s", (host) => {
    expect(isDisallowedWebhookHost(host)).toBe(false);
  });
});

describe("assertSafeWebhookEndpointUrl", () => {
  it("accepts a normal public HTTPS URL", () => {
    expect(() => assertSafeWebhookEndpointUrl("https://n8n.example.com/webhook/abc", { requireHttps: false })).not.toThrow();
  });

  it("BLOQUANT — rejects http://localhost", () => {
    expect(() => assertSafeWebhookEndpointUrl("http://localhost/x", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("BLOQUANT — rejects http://127.0.0.1", () => {
    expect(() => assertSafeWebhookEndpointUrl("http://127.0.0.1:8080/x", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("BLOQUANT — rejects http://[::1]", () => {
    expect(() => assertSafeWebhookEndpointUrl("http://[::1]/x", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("BLOQUANT — rejects a private network target", () => {
    expect(() => assertSafeWebhookEndpointUrl("http://192.168.1.50/x", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("BLOQUANT — rejects the cloud metadata endpoint", () => {
    expect(() => assertSafeWebhookEndpointUrl("http://169.254.169.254/latest/meta-data/", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("BLOQUANT — rejects a non-HTTP(S) protocol", () => {
    expect(() => assertSafeWebhookEndpointUrl("file:///etc/passwd", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
    expect(() => assertSafeWebhookEndpointUrl("ftp://example.com/x", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
    expect(() => assertSafeWebhookEndpointUrl("gopher://example.com/x", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("rejects a malformed URL", () => {
    expect(() => assertSafeWebhookEndpointUrl("not a url", { requireHttps: false })).toThrow(UnsafeWebhookEndpointUrlError);
  });

  it("mission §32 — requires HTTPS when requireHttps is set", () => {
    expect(() => assertSafeWebhookEndpointUrl("http://example.com/x", { requireHttps: true })).toThrow(UnsafeWebhookEndpointUrlError);
    expect(() => assertSafeWebhookEndpointUrl("https://example.com/x", { requireHttps: true })).not.toThrow();
  });
});
