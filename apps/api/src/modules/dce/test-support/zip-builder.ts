import { deflateRawSync } from "node:zlib";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const UNIX_HOST = 3;
const S_IFLNK = 0xa000;
/** Bit 11 du "general purpose bit flag" : indique que le nom d'entrée est encodé en UTF-8
 *  plutôt qu'en CP437 — sans lui, yauzl décode les noms non-ASCII de façon incorrecte. */
const UTF8_NAME_FLAG = 0x0800;

export type ZipEntrySpec = Readonly<{
  name: string;
  content?: Buffer;
  /** "store" (par défaut) : compressedSize doit égaler content.length — laisse yauzl faire son
   *  propre contrôle de cohérence. "deflate" : compressedSize/uncompressedSize sont fournis
   *  explicitement et peuvent volontairement mentir (utile pour simuler un ratio suspect). */
  method?: "store" | "deflate";
  /** N'est utilisé qu'avec method:"deflate" — permet de déclarer une taille décompressée très
   *  supérieure à la taille réelle du flux compressé (simulation de "zip bomb"). */
  declaredUncompressedSize?: number;
  isSymlink?: boolean;
}>;

/**
 * Construit un buffer ZIP valide (au sens du format) octet par octet, sans dépendre d'une
 * librairie d'écriture — nécessaire pour fabriquer des archives volontairement dangereuses
 * (noms traversants, chemins absolus, ratio de compression mensonger, symlink) qu'aucune
 * librairie "honnête" n'accepterait de produire. Réservé aux tests.
 */
export function buildZipBuffer(entries: readonly ZipEntrySpec[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const content = entry.content ?? Buffer.alloc(0);
    const method = entry.method ?? "store";

    let compressedData: Buffer;
    let compressionMethod: number;
    let compressedSize: number;
    let uncompressedSize: number;

    if (method === "store") {
      compressedData = content;
      compressionMethod = 0;
      compressedSize = content.length;
      uncompressedSize = content.length;
    } else {
      compressedData = deflateRawSync(content);
      compressionMethod = 8;
      compressedSize = compressedData.length;
      uncompressedSize = entry.declaredUncompressedSize ?? content.length;
    }

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(UTF8_NAME_FLAG, 6); // general purpose bit flag
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(0, 10); // last mod time
    localHeader.writeUInt16LE(0, 12); // last mod date
    localHeader.writeUInt32LE(0, 14); // crc32 (non vérifié par yauzl — voir zip-builder.ts)
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    const localRecord = Buffer.concat([localHeader, nameBuffer, compressedData]);
    localParts.push(localRecord);

    const externalAttributes = entry.isSymlink ? ((S_IFLNK | 0o777) << 16) >>> 0 : 0;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    centralHeader.writeUInt16LE((UNIX_HOST << 8) | 20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(UTF8_NAME_FLAG, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(0, 12); // last mod time
    centralHeader.writeUInt16LE(0, 14); // last mod date
    centralHeader.writeUInt32LE(0, 16); // crc32
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(externalAttributes, 38);
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(Buffer.concat([centralHeader, nameBuffer]));

    offset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // disk with central directory
  endRecord.writeUInt16LE(entries.length, 8); // entries on this disk
  endRecord.writeUInt16LE(entries.length, 10); // total entries
  endRecord.writeUInt32LE(centralDirectory.length, 12); // size of central directory
  endRecord.writeUInt32LE(centralDirectoryOffset, 16); // offset of central directory
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
