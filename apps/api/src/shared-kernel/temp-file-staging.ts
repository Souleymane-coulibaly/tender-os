import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type StagedTempFile = Readonly<{
  filePath: string;
  sizeBytes: number;
  sha256: string;
  readStream: () => Readable;
  cleanup: () => Promise<void>;
}>;

/**
 * Repli explicitement autorisé pour concilier `StorageProvider.put()` (qui exige `sizeBytes` en
 * amont) avec un flux dont la taille finale n'est connue qu'une fois entièrement généré (P2 ZIP
 * memory — Response Package / Submission Package) : écrit `source` vers un fichier temporaire
 * contrôlé (nom UUID, jamais dérivé d'une entrée utilisateur), en calculant taille et SHA-256 EN
 * MÊME TEMPS que l'écriture — jamais une relecture dédiée uniquement pour hasher. `pipeline()`
 * assure la contre-pression ; toute erreur en cours de route nettoie le fichier partiel avant de
 * se propager (jamais de fichier orphelin, jamais un succès partiel silencieux).
 */
export async function stageStreamToTempFile(source: NodeJS.ReadableStream, prefix: string): Promise<StagedTempFile> {
  const dir = join(tmpdir(), "tenderos-zip-staging");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${prefix}-${randomUUID()}.tmp`);

  const hash = createHash("sha256");
  let sizeBytes = 0;
  const hashingTee = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      callback(null, chunk);
    },
  });

  try {
    await pipeline(source, hashingTee, createWriteStream(filePath));
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }

  return {
    filePath,
    sizeBytes,
    sha256: hash.digest("hex"),
    readStream: () => createReadStream(filePath),
    cleanup: () => rm(filePath, { force: true }),
  };
}
