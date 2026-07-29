import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./image-dimensions";

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

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function buildPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const idatData = zlib.deflateSync(Buffer.from([0, 255, 255, 255]));
  return Buffer.concat([signature, pngChunk("IHDR", ihdrData), pngChunk("IDAT", idatData), pngChunk("IEND", Buffer.alloc(0))]);
}

/** SOI + un segment SOF0 minimal (3 composants) déclarant 640x480 — pas une image décodable
 *  complète, mais un en-tête JPEG structurellement réel, suffisant pour ce lecteur d'en-tête
 *  (mission Sprint 3 correction P1-03 — jamais un décodage complet de l'image). */
function buildJpeg(width: number, height: number): Buffer {
  const sof0 = Buffer.alloc(19);
  sof0.writeUInt8(0xff, 0);
  sof0.writeUInt8(0xc0, 1);
  sof0.writeUInt16BE(17, 2); // longueur du segment (17), en-têtes incluses
  sof0.writeUInt8(8, 4); // précision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.writeUInt8(3, 9); // nombre de composants
  sof0.writeUInt8(1, 10);
  sof0.writeUInt8(0x11, 11);
  sof0.writeUInt8(0, 12);
  sof0.writeUInt8(2, 13);
  sof0.writeUInt8(0x11, 14);
  sof0.writeUInt8(1, 15);
  sof0.writeUInt8(3, 16);
  sof0.writeUInt8(0x11, 17);
  sof0.writeUInt8(1, 18);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof0]);
}

describe("readImageDimensions", () => {
  it("reads real dimensions from a PNG IHDR chunk", () => {
    expect(readImageDimensions(buildPng(640, 480))).toEqual({ widthPx: 640, heightPx: 480 });
  });

  it("reads real dimensions from a JPEG SOF0 segment", () => {
    expect(readImageDimensions(buildJpeg(640, 480))).toEqual({ widthPx: 640, heightPx: 480 });
  });

  it("returns undefined for an unrecognized format, never throwing", () => {
    expect(readImageDimensions(Buffer.from("not an image"))).toBeUndefined();
  });

  it("returns undefined for a truncated/malformed header rather than guessing", () => {
    expect(readImageDimensions(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
  });
});
