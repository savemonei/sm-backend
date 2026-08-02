/**
 * Local JSON subscription catalog (no Supabase).
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export type CatalogPlan = {
  id: string;
  name: string;
  billingCycle: string;
  isDefault: boolean | null;
  trialDays: number | null;
  price: number;
  currency: string;
};

export type CatalogService = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  iconType: string | null;
  iconName: string | null;
  color: string | null;
  category: string | null;
  websiteUrl: string | null;
  isGlobal: boolean;
  plans: CatalogPlan[];
  popularityRank: number;
  isRegional: boolean;
  localName: string | null;
};

export type RegionPack = {
  region: string;
  currency: string;
  currencySymbol: string;
  services: CatalogService[];
  lastUpdated: string;
  cacheVersion: number;
};

export type CatalogManifest = {
  version: number;
  updatedAt: string;
  source?: string;
  regions: string[];
};

function catalogDir(): string {
  // Prefer built/copied path in dist, fall back to src for ts-node-dev
  const dist = join(process.cwd(), "dist", "data", "catalog");
  const src = join(process.cwd(), "src", "data", "catalog");
  if (existsSync(join(dist, "manifest.json"))) return dist;
  return src;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function getCatalogManifest(): CatalogManifest {
  return readJson(join(catalogDir(), "manifest.json"));
}

export function getRegionPack(region: string): RegionPack | null {
  const code = (region || "US").toUpperCase();
  const path = join(catalogDir(), "prices", `${code}.json`);
  if (!existsSync(path)) return null;
  return readJson<RegionPack>(path);
}
