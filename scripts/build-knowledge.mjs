/**
 * Builds precompressed knowledge packs for deployment.
 * Source: src/data/knowledge/*.json
 * Output: dist/data/knowledge/*.json.gz (deploy artifacts only)
 */
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "src", "data", "knowledge");
const outDir = join(root, "dist", "data", "knowledge");

const FILES = ["manifest", "features", "faq", "guides"];

function validateManifest(manifest) {
  if (typeof manifest.aiVersion !== "number") {
    throw new Error("manifest.aiVersion must be a number");
  }
  if (typeof manifest.minAiVersion !== "number" || typeof manifest.maxAiVersion !== "number") {
    throw new Error("manifest.minAiVersion and maxAiVersion are required");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("manifest.files must be a non-empty array");
  }
  for (const file of manifest.files) {
    if (!file.name || typeof file.version !== "number") {
      throw new Error(`Invalid manifest file entry: ${JSON.stringify(file)}`);
    }
    if (!FILES.includes(file.name) && file.name !== "manifest") {
      // allow only known content packs in files[]
      if (!["features", "faq", "guides"].includes(file.name)) {
        throw new Error(`Unknown knowledge file in manifest: ${file.name}`);
      }
    }
  }
}

async function gzipFile(srcPath, destPath) {
  await pipeline(createReadStream(srcPath), createGzip({ level: 9 }), createWriteStream(destPath));
}

function etagForFile(filePath) {
  const buf = readFileSync(filePath);
  return `"${createHash("sha1").update(buf).digest("hex")}"`;
}

async function main() {
  if (!existsSync(srcDir)) {
    throw new Error(`Knowledge source missing: ${srcDir}`);
  }

  mkdirSync(outDir, { recursive: true });

  const manifestPath = join(srcDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateManifest(manifest);

  const etags = {};

  for (const name of FILES) {
    const srcPath = join(srcDir, `${name}.json`);
    if (!existsSync(srcPath)) {
      throw new Error(`Missing knowledge source: ${srcPath}`);
    }
    // Ensure JSON parses
    JSON.parse(readFileSync(srcPath, "utf8"));

    const destPath = join(outDir, `${name}.json.gz`);
    await gzipFile(srcPath, destPath);
    etags[name] = etagForFile(destPath);
    console.log(`knowledge: wrote ${destPath}`);
  }

  writeFileSync(join(outDir, "etags.json"), JSON.stringify(etags, null, 2) + "\n");
  console.log("knowledge: build complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
