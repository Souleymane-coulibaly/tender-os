import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import type { R2Config } from "./r2-config";
import { CloudflareR2StorageProvider } from "./cloudflare-r2-storage.provider";

const TEST_CONFIG: R2Config = {
  accountId: "test-account",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-access-key-never-logged",
  bucketName: "tenderos-test",
  endpoint: "https://test-account.r2.cloudflarestorage.com",
};

function notFoundError(): S3ServiceException {
  const error = new S3ServiceException({
    name: "NotFound",
    $fault: "client",
    $metadata: { httpStatusCode: 404 },
  });
  return error;
}

// aws-sdk-client-mock intercepte `S3Client.prototype.send` — zéro appel réseau réel dans toute
// cette suite (mission §26.X.14 "les unit tests ne doivent pas nécessiter Internet").
const s3Mock = mockClient(S3Client);

describe("CloudflareR2StorageProvider", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe("put", () => {
    it("sends the stream, content type and length directly, without buffering", async () => {
      s3Mock.on(PutObjectCommand).resolves({});
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);
      const content = Readable.from(Buffer.from("hello"));

      await provider.put({ key: "org-1/doc-1/v1.pdf", content, contentType: "application/pdf", sizeBytes: 5 });

      const call = s3Mock.commandCalls(PutObjectCommand)[0];
      expect(call?.args[0].input).toMatchObject({
        Bucket: "tenderos-test",
        Key: "org-1/doc-1/v1.pdf",
        Body: content,
        ContentType: "application/pdf",
        ContentLength: 5,
      });
    });

    it("rejects when the SDK call fails, never silently succeeding", async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error("network unreachable"));
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      await expect(
        provider.put({ key: "org-1/doc-1/v1.pdf", content: Readable.from(Buffer.from("x")), contentType: "text/plain", sizeBytes: 1 }),
      ).rejects.toThrow(/Failed to store object "org-1\/doc-1\/v1\.pdf"/);
    });

    it("never includes the R2 secret in a thrown error message", async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error("network unreachable"));
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      try {
        await provider.put({ key: "k", content: Readable.from(Buffer.from("x")), contentType: "text/plain", sizeBytes: 1 });
        expect.fail("expected put() to reject");
      } catch (error) {
        expect(String(error)).not.toContain(TEST_CONFIG.secretAccessKey);
      }
    });
  });

  describe("openReadStream", () => {
    it("returns the object body as a readable stream", async () => {
      const body = Readable.from(Buffer.from("content"));
      s3Mock.on(GetObjectCommand).resolves({ Body: body as never });
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      const stream = await provider.openReadStream("org-1/doc-1/v1.pdf");

      expect(stream).toBe(body);
    });

    it("rejects when the SDK call fails", async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error("timeout"));
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      await expect(provider.openReadStream("missing-key")).rejects.toThrow(/Failed to read object "missing-key"/);
    });
  });

  describe("delete", () => {
    it("sends a DeleteObjectCommand for the given key", async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      await provider.delete("org-1/doc-1/v1.pdf");

      expect(s3Mock.commandCalls(DeleteObjectCommand)[0]?.args[0].input).toMatchObject({ Bucket: "tenderos-test", Key: "org-1/doc-1/v1.pdf" });
    });

    it("rejects when the SDK call fails", async () => {
      s3Mock.on(DeleteObjectCommand).rejects(new Error("network unreachable"));
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      await expect(provider.delete("k")).rejects.toThrow(/Failed to delete object "k"/);
    });
  });

  describe("exists", () => {
    it("returns true when HeadObject succeeds", async () => {
      s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 5 });
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      expect(await provider.exists("org-1/doc-1/v1.pdf")).toBe(true);
    });

    it("returns false only for a genuine NotFound", async () => {
      s3Mock.on(HeadObjectCommand).rejects(notFoundError());
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      expect(await provider.exists("missing-key")).toBe(false);
    });

    it("rethrows any non-NotFound error rather than reporting a false negative (mission: never a silent success)", async () => {
      s3Mock.on(HeadObjectCommand).rejects(new Error("R2 is down"));
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      await expect(provider.exists("k")).rejects.toThrow(/Failed to check existence of object "k"/);
    });
  });

  describe("getMetadata", () => {
    it("returns the real size and content type for an existing object", async () => {
      s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 42, ContentType: "image/png" });
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      expect(await provider.getMetadata("org-1/logo.png")).toEqual({ sizeBytes: 42, contentType: "image/png" });
    });

    it("returns null for a genuine NotFound", async () => {
      s3Mock.on(HeadObjectCommand).rejects(notFoundError());
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      expect(await provider.getMetadata("missing-key")).toBeNull();
    });

    it("rethrows any non-NotFound error rather than returning null (never confuse an outage with absence)", async () => {
      s3Mock.on(HeadObjectCommand).rejects(new Error("access denied"));
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      await expect(provider.getMetadata("k")).rejects.toThrow(/Failed to read metadata of object "k"/);
    });
  });

  describe("generateSignedUrl", () => {
    it("produces a URL scoped to the configured bucket and requested key, with the requested expiry", async () => {
      // `getSignedUrl` (@aws-sdk/s3-request-presigner) calcule la signature localement (SigV4),
      // sans appel réseau — pas besoin de `s3Mock` ici, `TEST_CONFIG` (identifiants factices)
      // suffit à produire une vraie URL signée syntaxiquement correcte.
      const provider = new CloudflareR2StorageProvider(TEST_CONFIG);

      const url = await provider.generateSignedUrl("org-1/doc-1/v1.pdf", 60);

      expect(url).toContain("tenderos-test");
      expect(url).toContain("org-1/doc-1/v1.pdf");
      expect(url).toContain("X-Amz-Expires=60");
      expect(url).not.toContain(TEST_CONFIG.secretAccessKey);
    });
  });
});
