/**
 * Refresh goal-template derived artifacts from JSON packs.
 *
 * Source of truth (edit these directly):
 *   sm-backend/src/data/goals/templates.json
 *   sm-backend/src/data/goals/regions/{CODE}.json
 *
 * Regenerates:
 *   sm-backend/src/data/goals/manifest.json
 *   sm-mobile/lib/data/goal-templates-seed.json  (offline fallback = US pack)
 *
 * Usage: node scripts/dump-goal-templates.mjs
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const mobileRoot = join(backendRoot, "..", "sm-mobile");
const outDir = join(backendRoot, "src", "data", "goals");
const regionsDir = join(outDir, "regions");

const VERSION = 1;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

if (!existsSync(join(outDir, "templates.json"))) {
  console.error(
    "Missing src/data/goals/templates.json.\n" +
      "Goal templates live as JSON now — edit packs under src/data/goals/regions/."
  );
  process.exit(1);
}

if (!existsSync(regionsDir)) {
  console.error("Missing src/data/goals/regions/");
  process.exit(1);
}

const now = new Date().toISOString();
const base = readJson(join(outDir, "templates.json"));
const regionFiles = readdirSync(regionsDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

if (!regionFiles.length) {
  console.error("No region packs found in src/data/goals/regions/");
  process.exit(1);
}

const regions = [];
let usPack = null;

for (const file of regionFiles) {
  const code = file.replace(/\.json$/, "");
  const path = join(regionsDir, file);
  const pack = readJson(path);

  // Keep author edits; refresh metadata for cache invalidation consumers
  pack.region = pack.region || code;
  pack.lastUpdated = now;
  pack.cacheVersion = VERSION;
  if (!Array.isArray(pack.templates)) pack.templates = [];
  if (!Array.isArray(pack.featured)) pack.featured = [];

  writeJson(path, pack);
  regions.push(code);
  if (code === "US") usPack = pack;

  console.log(
    `${code}: ${pack.templates.length} templates (${pack.featured.length} featured)`
  );
}

writeJson(join(outDir, "templates.json"), {
  version: VERSION,
  updatedAt: now,
  templates: base.templates || [],
});

writeJson(join(outDir, "manifest.json"), {
  version: VERSION,
  updatedAt: now,
  source: "dump-goal-templates",
  regions,
  notes:
    "Goal templates only (not user goals). Edit regions/*.json directly; FR/ES/IT/NL map to DE on the API.",
});

if (!usPack) {
  console.error("US pack missing — seed not updated");
  process.exit(1);
}

writeJson(join(mobileRoot, "lib/data/goal-templates-seed.json"), usPack);

console.log(`\nGoal templates refreshed → ${outDir}`);
console.log(`Seed written → sm-mobile/lib/data/goal-templates-seed.json`);
