import { Injectable } from "@nestjs/common";
import type { DetectedFileSignature, FileSignatureDetector } from "../application/ports/file-signature-detector";

type Signature = Readonly<{ mimeType: string; bytes: readonly number[] }>;

/**
 * Signatures binaires ("magic bytes") des 7 formats en portée pour cette tranche du DCE. ZIP,
 * DOCX et XLSX partagent la même signature de conteneur (`PK\x03\x04`) : la distinction fine
 * entre les trois nécessiterait d'ouvrir l'archive et d'inspecter son contenu interne (ex.
 * `[Content_Types].xml` pour Office), hors de portée d'un sniffer volontairement minimal — la
 * famille "zip" couvre donc les trois extensions (voir `isZipFamilySignature` côté appelant).
 */
const SIGNATURES: readonly Signature[] = [
  { mimeType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mimeType: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK\x03\x04 — ZIP/DOCX/XLSX
  { mimeType: "application/x-ole-compound", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // XLS legacy
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

function matchesAt(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[index] === byte);
}

/**
 * Dépendance zéro, volontairement — pas d'ajout d'une librairie de sniffing (risque
 * d'incompatibilité ESM/CJS constaté sur les versions récentes de `file-type`, voir rapport
 * final). Ne couvre que les 7 formats acceptés par le DCE, pas un détecteur générique.
 */
@Injectable()
export class MagicByteFileSignatureDetector implements FileSignatureDetector {
  detect(buffer: Buffer): DetectedFileSignature | null {
    const match = SIGNATURES.find((signature) => matchesAt(buffer, signature.bytes));
    return match ? { mimeType: match.mimeType } : null;
  }
}
