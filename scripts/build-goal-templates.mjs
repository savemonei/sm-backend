/**
 * Copy goal template JSON into dist/data/goals for production.
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "src", "data", "goals");
const dest = join(__dirname, "..", "dist", "data", "goals");

if (!existsSync(join(src, "manifest.json"))) {
  console.error("Goal templates missing. Run: node scripts/dump-goal-templates.mjs");
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Goal templates copied → dist/data/goals");
