import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { ImageDimensionLimitExceededError, OcrProviderUnavailableError } from "../domain/extraction-errors";
import type { ExtractionConfig } from "./extraction-config";
import { TesseractOcrProvider } from "./tesseract-ocr.provider";

function config(overrides?: Partial<ExtractionConfig>): ExtractionConfig {
  return {
    ocrProvider: "tesseract",
    ocrTimeoutMs: 30000,
    ocrMaxRetries: 2,
    ocrRetryDelayMs: 1000,
    ocrMaxFileSizeBytes: 25 * 1024 * 1024,
    ocrSupportedMimeTypes: ["image/png", "image/jpeg"],
    extractionMaxPages: 200,
    extractionMaxCharacters: 2_000_000,
    extractionChunkSize: 2000,
    extractionChunkOverlap: 200,
    extractionMinTextLength: 20,
    extractionMaxFileSizeBytes: 50 * 1024 * 1024,
    extractionMaxSheets: 50,
    extractionMaxRowsPerSheet: 50000,
    extractionMaxImageDimensionPx: 10000,
    ...overrides,
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Construit un PNG 1x1 réel, byte-exact (signature + IHDR + IDAT + IEND, CRC32 calculés) — même
 *  motif que `buildMinimalPdf` : jamais un fichier binaire versionné ni téléchargé. Ce n'est PAS
 *  une image contenant du texte lisible ; elle ne sert qu'à prouver une exécution RÉELLE du
 *  moteur Tesseract (mission Sprint 3 §19 "jamais un mock de l'appel réel"), pas la justesse de
 *  la reconnaissance — celle-ci a été validée séparément et manuellement pendant le développement
 *  contre une vraie image texte (voir rapport final, section H). */
function buildTinyPng(declaredWidth = 1, declaredHeight = 1): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(declaredWidth, 0); // width (déclarée dans l'en-tête IHDR)
  ihdrData.writeUInt32BE(declaredHeight, 4); // height (idem — jamais recalculée depuis les pixels)
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type: RGB
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const raw = Buffer.from([0, 255, 255, 255]); // filter byte 0 + one white RGB pixel
  const idatData = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("TesseractOcrProvider", () => {
  it("rejects an image larger than OCR_MAX_FILE_SIZE_MB before ever invoking the OCR engine", async () => {
    const provider = new TesseractOcrProvider(config({ ocrMaxFileSizeBytes: 10 }));
    await expect(
      provider.extract({ imageBuffer: Buffer.alloc(20), mimeType: "image/png", languageHints: [] }),
    ).rejects.toThrow(OcrProviderUnavailableError);
  });

  it("rejects an unsupported MIME type before ever invoking the OCR engine", async () => {
    const provider = new TesseractOcrProvider(config({ ocrSupportedMimeTypes: ["image/png"] }));
    await expect(
      provider.extract({ imageBuffer: Buffer.alloc(10), mimeType: "image/gif", languageHints: [] }),
    ).rejects.toThrow(OcrProviderUnavailableError);
  });

  // Correction P1-03 — dimensions lues depuis le véritable en-tête PNG (IHDR), jamais un décodage
  // complet de l'image : un fichier PNG minuscule mais déclarant des dimensions énormes est
  // refusé avant tout appel au moteur OCR.
  it("rejects an image whose declared PNG dimensions exceed the configured maximum, before invoking the OCR engine", async () => {
    const provider = new TesseractOcrProvider(config({ extractionMaxImageDimensionPx: 10000 }));
    await expect(
      provider.extract({ imageBuffer: buildTinyPng(50000, 200), mimeType: "image/png", languageHints: [] }),
    ).rejects.toThrow(ImageDimensionLimitExceededError);
  });

  // Preuve réelle (mission Sprint 3 §19) : exécute effectivement le moteur Tesseract.js WASM,
  // jamais un mock — délai généreux car le worker charge de vraies données de langue à froid.
  it(
    "genuinely runs the Tesseract engine end-to-end and returns a well-formed result",
    async () => {
      const provider = new TesseractOcrProvider(config());
      const result = await provider.extract({
        imageBuffer: buildTinyPng(),
        mimeType: "image/png",
        languageHints: ["en"],
      });

      expect(typeof result.text).toBe("string");
      expect(result.provider).toBe("tesseract.js");
      expect(result.durationMs).toBeGreaterThan(0);
      expect(Array.isArray(result.warnings)).toBe(true);
      // Jamais une clé/secret fournisseur dans le résultat (mission §9 "sécurité").
      expect(JSON.stringify(result)).not.toMatch(/key|token|secret/i);
    },
    60000,
  );
});
