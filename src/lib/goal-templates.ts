/**
 * Local JSON goal templates catalog (templates only — not user goals).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type GoalTemplate = {
  id: string;
  name: string;
  icon: string;
  color: string;
  tagline: string;
  description?: string;
  type: "saving" | "save_and_spend" | "spending";
  category: "saving" | "save_and_spend" | "spending";
  suggested_target?: number;
  suggested_deadline_months?: number;
  suggested_budget?: number;
  suggested_duration_days?: number;
  is_yearly?: boolean;
  event_month?: number;
  event_day?: number;
  popularity?: number;
  isRegional?: boolean;
};

export type GoalTemplatesPack = {
  region: string;
  currency: string;
  templates: GoalTemplate[];
  featured: GoalTemplate[];
  lastUpdated: string;
  cacheVersion: number;
};

export type GoalTemplatesManifest = {
  version: number;
  updatedAt: string;
  source?: string;
  regions: string[];
};

/** Country codes that share another region's pack until localized. */
const REGION_ALIASES: Record<string, string> = {
  FR: "DE",
  ES: "DE",
  IT: "DE",
  NL: "DE",
};

function goalsDir(): string {
  const dist = join(process.cwd(), "dist", "data", "goals");
  const src = join(process.cwd(), "src", "data", "goals");
  if (existsSync(join(dist, "manifest.json"))) return dist;
  return src;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function resolveGoalRegion(region: string): string {
  const code = (region || "US").toUpperCase();
  return REGION_ALIASES[code] || code;
}

export function getGoalTemplatesManifest(): GoalTemplatesManifest {
  return readJson(join(goalsDir(), "manifest.json"));
}

export function getGoalTemplatesPack(region: string): GoalTemplatesPack | null {
  const code = resolveGoalRegion(region);
  const path = join(goalsDir(), "regions", `${code}.json`);
  if (!existsSync(path)) return null;
  return readJson<GoalTemplatesPack>(path);
}
