/**
 * Lecture des dimensions d'une image PNG/JPEG directement depuis l'en-tête du buffer (correction
 * P1-03) — jamais un décodage complet de l'image, jamais une dépendance supplémentaire : les deux
 * formats exposent leurs dimensions dans les tout premiers octets du fichier.
 *
 * Limite documentée : ne reconnaît que PNG (chunk IHDR à un offset fixe) et JPEG (premier marqueur
 * SOFn rencontré) ; retourne `undefined` pour tout autre format ou en-tête malformé plutôt que de
 * lever une erreur — l'appelant traite alors l'absence de dimension comme "non vérifiable", jamais
 * comme un dépassement.
 */
export function readImageDimensions(buffer: Buffer): { widthPx: number; heightPx: number } | undefined {
  if (isPng(buffer)) {
    return readPngDimensions(buffer);
  }
  if (isJpeg(buffer)) {
    return readJpegDimensions(buffer);
  }
  return undefined;
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function readPngDimensions(buffer: Buffer): { widthPx: number; heightPx: number } | undefined {
  // Signature (8) + longueur IHDR (4) + "IHDR" (4) = offset 16, puis width(4) height(4).
  if (buffer.length < 24) {
    return undefined;
  }
  const widthPx = buffer.readUInt32BE(16);
  const heightPx = buffer.readUInt32BE(20);
  return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpegDimensions(buffer: Buffer): { widthPx: number; heightPx: number } | undefined {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (SOF_MARKERS.has(marker)) {
      const heightPx = buffer.readUInt16BE(offset + 5);
      const widthPx = buffer.readUInt16BE(offset + 7);
      return widthPx > 0 && heightPx > 0 ? { widthPx, heightPx } : undefined;
    }
    offset += 2 + segmentLength;
  }
  return undefined;
}
