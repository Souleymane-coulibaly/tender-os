// V2 Sprint 23 (landing) — génère les PNG/ICO favicons à partir de la source vectorielle unique
// (`public/brand/tenderos-icon-square.svg`), jamais un second dessin manuel divergent. Script de
// gouvernance de marque (mission "Fichiers fournis") — relancer après toute évolution du logo :
//   node scripts/generate-favicons.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "public/brand/tenderos-icon-square.svg");
const publicDir = path.join(root, "public");

const targets = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "android-chrome-192x192.png", size: 192 },
  { file: "android-chrome-512x512.png", size: 512 },
];

async function main() {
  await mkdir(publicDir, { recursive: true });
  const svg = await readFile(svgPath);

  const pngBuffers = {};
  for (const target of targets) {
    const buffer = await sharp(svg).resize(target.size, target.size).png().toBuffer();
    await writeFile(path.join(publicDir, target.file), buffer);
    pngBuffers[target.size] = buffer;
    console.log(`wrote ${target.file}`);
  }

  const icoBuffer = await pngToIco([
    await sharp(svg).resize(16, 16).png().toBuffer(),
    await sharp(svg).resize(32, 32).png().toBuffer(),
    await sharp(svg).resize(48, 48).png().toBuffer(),
  ]);
  await writeFile(path.join(publicDir, "favicon.ico"), icoBuffer);
  console.log("wrote favicon.ico (16/32/48)");

  const ogSource = path.join(root, "public/brand/og-image-source.svg");
  const ogBuffer = await sharp(ogSource).resize(1200, 630).png().toBuffer();
  await writeFile(path.join(publicDir, "og-image.png"), ogBuffer);
  console.log("wrote og-image.png (1200x630)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
