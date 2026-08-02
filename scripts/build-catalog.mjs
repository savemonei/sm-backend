/**
 * Copy catalog JSON into dist/data/catalog for production.
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "src", "data", "catalog");
const dest = join(__dirname, "..", "dist", "data", "catalog");

if (!existsSync(join(src, "manifest.json"))) {
  console.error("Catalog missing. Run: node scripts/enrich-catalog.mjs");
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Catalog copied → dist/data/catalog");
