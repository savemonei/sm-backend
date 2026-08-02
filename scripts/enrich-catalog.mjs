/**
 * Rebuild catalog JSON from raw dump + curated latest prices (Aug 2026 research).
 *
 * Writes:
 *   src/data/catalog/regions.json
 *   src/data/catalog/services.json
 *   src/data/catalog/prices/{REGION}.json   (API-shaped packs)
 *   src/data/catalog/manifest.json
 *   src/data/catalog/raw/*                 (updated normalized tables)
 *
 * Usage: node scripts/enrich-catalog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "src", "data", "catalog");
const rawDir = join(root, "raw");
const pricesDir = join(root, "prices");

const CURRENCY = {
  US: { code: "USD", symbol: "$" },
  IN: { code: "INR", symbol: "₹" },
  UK: { code: "GBP", symbol: "£" },
  DE: { code: "EUR", symbol: "€" },
  FR: { code: "EUR", symbol: "€" },
  CA: { code: "CAD", symbol: "C$" },
  AU: { code: "AUD", symbol: "A$" },
  JP: { code: "JPY", symbol: "¥" },
  BR: { code: "BRL", symbol: "R$" },
  MX: { code: "MXN", symbol: "MX$" },
};

/**
 * Curated latest list prices (web-published / help-center Aug 2026).
 * Key: serviceSlug → planName → { billingCycle, isDefault, trialDays, prices: { REGION: amount } }
 */
const CATALOG = {
  netflix: {
    plans: [
      // DE help/press; FR 7.99/14.99/21.99; AU Canstar Jul 2026; MX Apr 2026 hike; CA MobileSyrup
      { name: "Standard with Ads", cycle: "monthly", def: false, trial: 0, prices: { US: 8.99, IN: 149, UK: 5.99, DE: 4.99, FR: 7.99, CA: 7.99, AU: 9.99, JP: 890, BR: 20.9, MX: 139 } },
      { name: "Mobile", cycle: "monthly", def: false, trial: 0, prices: { IN: 149 } },
      { name: "Basic", cycle: "monthly", def: false, trial: 0, prices: { IN: 199 } },
      { name: "Standard", cycle: "monthly", def: true, trial: 0, prices: { US: 19.99, IN: 499, UK: 12.99, DE: 13.99, FR: 14.99, CA: 18.99, AU: 20.99, JP: 1590, BR: 44.9, MX: 269 } },
      { name: "Premium", cycle: "monthly", def: false, trial: 0, prices: { US: 26.99, IN: 649, UK: 18.99, DE: 19.99, FR: 21.99, CA: 23.99, AU: 28.99, JP: 1980, BR: 59.9, MX: 369 } },
    ],
  },
  spotify: {
    plans: [
      // AU/MX from spotify.com; JP Individual ¥1080; BR InfoMoney R$23.90
      { name: "Individual", cycle: "monthly", def: true, trial: 30, prices: { US: 12.99, IN: 119, UK: 12.99, DE: 11.99, FR: 11.99, CA: 12.99, AU: 15.99, JP: 1080, BR: 23.9, MX: 139 } },
      { name: "Student", cycle: "monthly", def: false, trial: 30, prices: { US: 6.99, IN: 59, UK: 5.99, DE: 5.99, FR: 5.99, CA: 5.99, AU: 7.99, JP: 540, BR: 12.9, MX: 74 } },
      { name: "Duo", cycle: "monthly", def: false, trial: 30, prices: { US: 18.99, IN: 149, UK: 17.99, DE: 16.99, FR: 16.99, CA: 16.99, AU: 22.99, JP: 1480, BR: 32.9, MX: 189 } },
      { name: "Family", cycle: "monthly", def: false, trial: 30, prices: { US: 21.99, IN: 179, UK: 21.99, DE: 19.99, FR: 19.99, CA: 20.99, AU: 27.99, JP: 1880, BR: 39.9, MX: 239 } },
    ],
  },
  disney: {
    plans: [
      // DE/FR help.disneyplus €6.99/10.99/15.99; CA MobileSyrup; AU Canstar; JP help; BR Oficina; MX help
      { name: "Standard with Ads", cycle: "monthly", def: false, trial: 0, prices: { US: 11.99, UK: 5.99, DE: 6.99, FR: 6.99, CA: 8.99, AU: 9.99, BR: 27.99, MX: 159 } },
      { name: "Standard", cycle: "monthly", def: false, trial: 0, prices: { UK: 9.99, DE: 10.99, FR: 10.99, CA: 15.99, AU: 17.99, JP: 1250, BR: 46.9, MX: 259 } },
      { name: "Premium", cycle: "monthly", def: true, trial: 0, prices: { US: 18.99, IN: 299, UK: 14.99, DE: 15.99, FR: 15.99, CA: 16.99, AU: 24.99, JP: 1670, BR: 66.9, MX: 339 } },
      { name: "Mobile", cycle: "monthly", def: false, trial: 0, prices: { IN: 149 } },
    ],
  },
  "amazon-prime": {
    plans: [
      // AU yearly A$79 (Canstar); MX yearly MX$899; CA yearly C$99
      { name: "Monthly", cycle: "monthly", def: true, trial: 30, prices: { US: 14.99, IN: 299, UK: 8.99, DE: 8.99, FR: 6.99, CA: 9.99, AU: 9.99, JP: 600, BR: 19.9, MX: 99 } },
      { name: "Yearly", cycle: "yearly", def: false, trial: 0, prices: { US: 139, IN: 1499, UK: 95, DE: 89.9, FR: 69.9, CA: 99, AU: 79, JP: 5900, BR: 149.9, MX: 899 } },
    ],
  },
  "youtube-premium": {
    plans: [
      { name: "Lite", cycle: "monthly", def: false, trial: 14, prices: { US: 8.99, IN: 89 } },
      { name: "Individual", cycle: "monthly", def: true, trial: 30, prices: { US: 15.99, IN: 129, UK: 12.99, DE: 12.99, FR: 12.99, CA: 13.99, AU: 14.99, JP: 1280, BR: 24.9, MX: 179 } },
      { name: "Family", cycle: "monthly", def: false, trial: 30, prices: { US: 26.99, IN: 299, UK: 20.99, DE: 20.99, FR: 20.99, CA: 21.99, AU: 23.99, JP: 2180, BR: 39.9, MX: 269 } },
      { name: "Student", cycle: "monthly", def: false, trial: 30, prices: { US: 8.99, IN: 79, UK: 6.99 } },
    ],
  },
  "apple-music": {
    plans: [
      { name: "Voice", cycle: "monthly", def: false, trial: 30, prices: { US: 4.99, IN: 59 } },
      { name: "Student", cycle: "monthly", def: false, trial: 30, prices: { US: 6.99, IN: 69, UK: 5.99, DE: 6.99, FR: 6.99, CA: 5.99, AU: 7.99, JP: 580, BR: 12.9, MX: 74 } },
      { name: "Individual", cycle: "monthly", def: true, trial: 30, prices: { US: 11.99, IN: 139, UK: 11.99, DE: 11.99, FR: 11.99, CA: 11.99, AU: 12.99, JP: 1080, BR: 23.9, MX: 129 } },
      { name: "Family", cycle: "monthly", def: false, trial: 30, prices: { US: 19.99, IN: 229, UK: 19.99, DE: 19.99, FR: 19.99, CA: 18.99, AU: 19.99, JP: 1680, BR: 37.9, MX: 199 } },
    ],
  },
  chatgpt: {
    plans: [
      { name: "Plus", cycle: "monthly", def: true, trial: 0, prices: { US: 20, IN: 1950, UK: 20, DE: 20, FR: 20, CA: 26, AU: 33, JP: 3000, BR: 110, MX: 399 } },
      { name: "Pro", cycle: "monthly", def: false, trial: 0, prices: { US: 200, UK: 200, DE: 200, FR: 200 } },
    ],
  },
  sonyliv: {
    plans: [
      { name: "Mobile", cycle: "monthly", def: false, trial: 0, prices: { IN: 299 } },
      { name: "Premium", cycle: "monthly", def: true, trial: 0, prices: { IN: 599 } },
      { name: "Premium Lite", cycle: "yearly", def: false, trial: 0, prices: { IN: 999 } },
    ],
  },
  zee5: {
    plans: [
      { name: "Premium", cycle: "monthly", def: true, trial: 0, prices: { IN: 149 } },
      { name: "Premium HD", cycle: "yearly", def: false, trial: 0, prices: { IN: 999 } },
    ],
  },
  "swiggy-one": {
    plans: [{ name: "One", cycle: "monthly", def: true, trial: 0, prices: { IN: 149 } }],
  },
  "zomato-gold": {
    plans: [{ name: "Gold", cycle: "monthly", def: true, trial: 0, prices: { IN: 75 } }],
  },
  hulu: {
    plans: [
      { name: "With Ads", cycle: "monthly", def: false, trial: 30, prices: { US: 9.99 } },
      { name: "No Ads", cycle: "monthly", def: true, trial: 30, prices: { US: 18.99 } },
    ],
  },
  peacock: {
    plans: [
      { name: "Premium", cycle: "monthly", def: true, trial: 7, prices: { US: 7.99 } },
      { name: "Premium Plus", cycle: "monthly", def: false, trial: 7, prices: { US: 13.99 } },
    ],
  },
  "now-tv": {
    plans: [
      { name: "Entertainment", cycle: "monthly", def: true, trial: 7, prices: { UK: 9.99 } },
      { name: "Cinema", cycle: "monthly", def: false, trial: 7, prices: { UK: 11.99 } },
      { name: "Sports", cycle: "monthly", def: false, trial: 7, prices: { UK: 34.99 } },
    ],
  },
  britbox: {
    plans: [{ name: "Standard", cycle: "monthly", def: true, trial: 7, prices: { UK: 7.99, US: 8.99, CA: 8.99, AU: 13.99 } }],
  },
  hotstar: {
    plans: [
      { name: "Mobile", cycle: "monthly", def: false, trial: 0, prices: { IN: 149 } },
      { name: "Super", cycle: "monthly", def: true, trial: 0, prices: { IN: 299 } },
      { name: "Premium", cycle: "monthly", def: false, trial: 0, prices: { IN: 499 } },
    ],
  },
  // Region-exclusive additions (Aug 2026)
  crave: {
    plans: [
      { name: "Standard with Ads", cycle: "monthly", def: false, trial: 0, prices: { CA: 11.99 } },
      { name: "Premium", cycle: "monthly", def: true, trial: 0, prices: { CA: 22 } },
    ],
  },
  stan: {
    plans: [
      { name: "Basic", cycle: "monthly", def: false, trial: 0, prices: { AU: 12 } },
      { name: "Standard", cycle: "monthly", def: true, trial: 0, prices: { AU: 17.99 } },
      { name: "Premium", cycle: "monthly", def: false, trial: 0, prices: { AU: 23.99 } },
    ],
  },
  max: {
    plans: [
      // DE TV Movie; BR Oficina; MX Vanguardia; AU Canstar; FR aligned with DE EUR
      { name: "Basic with Ads", cycle: "monthly", def: false, trial: 0, prices: { DE: 5.99, FR: 5.99, BR: 29.9, MX: 149, AU: 11.99 } },
      { name: "Standard", cycle: "monthly", def: true, trial: 0, prices: { DE: 11.99, FR: 11.99, BR: 44.9, MX: 239, AU: 15.99 } },
      { name: "Premium", cycle: "monthly", def: false, trial: 0, prices: { DE: 16.99, FR: 16.99, BR: 55.9, MX: 299, AU: 21.99 } },
    ],
  },
  globoplay: {
    plans: [
      { name: "Standard with Ads", cycle: "monthly", def: false, trial: 0, prices: { BR: 22.9 } },
      { name: "Premium", cycle: "monthly", def: true, trial: 0, prices: { BR: 39.9 } },
    ],
  },
  "canal-plus": {
    // Selectra Jul 2026 — no-commitment list prices
    plans: [
      { name: "Essentiel", cycle: "monthly", def: true, trial: 0, prices: { FR: 24.99 } },
      { name: "Ciné Séries", cycle: "monthly", def: false, trial: 0, prices: { FR: 34.99 } },
      { name: "Sport", cycle: "monthly", def: false, trial: 0, prices: { FR: 39.99 } },
    ],
  },
  dazn: {
    // DAZN DE flexible monthly; Mobile Pass entry
    plans: [
      { name: "Mobile Pass", cycle: "monthly", def: false, trial: 0, prices: { DE: 9.99 } },
      { name: "Super Sports", cycle: "monthly", def: true, trial: 0, prices: { DE: 24.99 } },
      { name: "Unlimited", cycle: "monthly", def: false, trial: 0, prices: { DE: 44.99 } },
    ],
  },
  "rtl-plus": {
    plans: [
      { name: "Basic", cycle: "monthly", def: false, trial: 0, prices: { DE: 5.99 } },
      { name: "Premium", cycle: "monthly", def: true, trial: 0, prices: { DE: 9.99 } },
      { name: "Premium Ad-Free", cycle: "monthly", def: false, trial: 0, prices: { DE: 12.99 } },
    ],
  },
  binge: {
    // Canstar / Binge AU 2026
    plans: [
      { name: "Basic with Ads", cycle: "monthly", def: false, trial: 7, prices: { AU: 10 } },
      { name: "Standard", cycle: "monthly", def: true, trial: 7, prices: { AU: 19 } },
      { name: "Premium", cycle: "monthly", def: false, trial: 7, prices: { AU: 22 } },
    ],
  },
  kayo: {
    // Kayo help — Feb 2026 prices
    plans: [
      { name: "Standard", cycle: "monthly", def: true, trial: 0, prices: { AU: 29.99 } },
      { name: "Premium", cycle: "monthly", def: false, trial: 0, prices: { AU: 45.99 } },
    ],
  },
  abema: {
    // ABEMA Premium post Apr 2026 hike
    plans: [
      { name: "Premium with Ads", cycle: "monthly", def: false, trial: 14, prices: { JP: 680 } },
      { name: "Premium", cycle: "monthly", def: true, trial: 14, prices: { JP: 1180 } },
    ],
  },
  "u-next": {
    plans: [{ name: "Standard", cycle: "monthly", def: true, trial: 31, prices: { JP: 2189 } }],
  },
};

/** New regional services merged into the services table if missing. */
const NEW_SERVICES = [
  {
    slug: "crave",
    name: "Crave",
    icon: "🇨🇦",
    icon_type: "emoji",
    icon_name: "television-classic",
    color: "#E50914",
    category: "streaming",
    website_url: "https://www.crave.ca",
    is_global: false,
  },
  {
    slug: "stan",
    name: "Stan",
    icon: "🇦🇺",
    icon_type: "emoji",
    icon_name: "television",
    color: "#00ADEF",
    category: "streaming",
    website_url: "https://www.stan.com.au",
    is_global: false,
  },
  {
    slug: "max",
    name: "Max",
    icon: "🟣",
    icon_type: "emoji",
    icon_name: "play-box",
    color: "#002BE7",
    category: "streaming",
    website_url: "https://www.max.com",
    is_global: false,
  },
  {
    slug: "globoplay",
    name: "Globoplay",
    icon: "🔴",
    icon_type: "emoji",
    icon_name: "television-classic",
    color: "#F71963",
    category: "streaming",
    website_url: "https://globoplay.globo.com",
    is_global: false,
  },
  {
    slug: "canal-plus",
    name: "Canal+",
    icon: "📺",
    icon_type: "emoji",
    icon_name: "television",
    color: "#000000",
    category: "streaming",
    website_url: "https://www.canalplus.com",
    is_global: false,
  },
  {
    slug: "dazn",
    name: "DAZN",
    icon: "⚽",
    icon_type: "emoji",
    icon_name: "soccer",
    color: "#F7FF1A",
    category: "streaming",
    website_url: "https://www.dazn.com",
    is_global: false,
  },
  {
    slug: "rtl-plus",
    name: "RTL+",
    icon: "🟠",
    icon_type: "emoji",
    icon_name: "television-classic",
    color: "#FA6600",
    category: "streaming",
    website_url: "https://plus.rtl.de",
    is_global: false,
  },
  {
    slug: "binge",
    name: "BINGE",
    icon: "🎬",
    icon_type: "emoji",
    icon_name: "movie-open",
    color: "#FF008A",
    category: "streaming",
    website_url: "https://binge.com.au",
    is_global: false,
  },
  {
    slug: "kayo",
    name: "Kayo Sports",
    icon: "🏉",
    icon_type: "emoji",
    icon_name: "football",
    color: "#00A651",
    category: "streaming",
    website_url: "https://kayosports.com.au",
    is_global: false,
  },
  {
    slug: "abema",
    name: "ABEMA",
    icon: "🟢",
    icon_type: "emoji",
    icon_name: "television",
    color: "#00C300",
    category: "streaming",
    website_url: "https://abema.tv",
    is_global: false,
  },
  {
    slug: "u-next",
    name: "U-NEXT",
    icon: "⬛",
    icon_type: "emoji",
    icon_name: "play-box",
    color: "#1A1A1A",
    category: "streaming",
    website_url: "https://video.unext.jp",
    is_global: false,
  },
];

/** Popularity ranks per region (lower = higher). */
const RANK = {
  US: ["netflix", "spotify", "youtube-premium", "amazon-prime", "disney", "apple-music", "chatgpt", "hulu", "peacock", "britbox"],
  IN: ["hotstar", "netflix", "amazon-prime", "spotify", "youtube-premium", "sonyliv", "zee5", "swiggy-one", "zomato-gold", "apple-music", "chatgpt", "disney"],
  UK: ["netflix", "spotify", "amazon-prime", "disney", "youtube-premium", "apple-music", "now-tv", "britbox", "chatgpt"],
  DE: ["netflix", "spotify", "amazon-prime", "disney", "max", "rtl-plus", "dazn", "youtube-premium", "apple-music", "chatgpt"],
  FR: ["netflix", "canal-plus", "spotify", "amazon-prime", "disney", "max", "youtube-premium", "apple-music", "chatgpt"],
  CA: ["netflix", "spotify", "amazon-prime", "disney", "crave", "youtube-premium", "apple-music", "chatgpt", "britbox"],
  AU: ["netflix", "spotify", "stan", "binge", "kayo", "amazon-prime", "disney", "max", "youtube-premium", "apple-music", "chatgpt", "britbox"],
  JP: ["netflix", "disney", "abema", "u-next", "spotify", "amazon-prime", "youtube-premium", "apple-music", "chatgpt"],
  BR: ["netflix", "globoplay", "spotify", "amazon-prime", "disney", "max", "youtube-premium", "apple-music", "chatgpt"],
  MX: ["netflix", "spotify", "disney", "amazon-prime", "max", "youtube-premium", "apple-music", "chatgpt"],
};

function loadJson(name) {
  return JSON.parse(readFileSync(join(rawDir, name), "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

const regionsRaw = loadJson("regions.json");
const servicesRaw = loadJson("subscription_services.json");
const now = new Date().toISOString();

// Merge newly curated regional services into the dump table
const existingSlugs = new Set(servicesRaw.map((s) => s.slug));
for (const s of NEW_SERVICES) {
  if (existingSlugs.has(s.slug)) continue;
  servicesRaw.push({
    id: randomUUID(),
    ...s,
    created_at: now,
    updated_at: now,
  });
  existingSlugs.add(s.slug);
  console.log(`+ service ${s.slug}`);
}

const bySlug = Object.fromEntries(servicesRaw.map((s) => [s.slug, s]));

const planRows = [];
const priceRows = [];
const availRows = [];

for (const [slug, def] of Object.entries(CATALOG)) {
  const service = bySlug[slug];
  if (!service) {
    console.warn(`Skip unknown slug (not in services dump): ${slug}`);
    continue;
  }
  for (const plan of def.plans) {
    const planId = randomUUID();
    planRows.push({
      id: planId,
      service_id: service.id,
      plan_name: plan.name,
      billing_cycle: plan.cycle,
      is_default: plan.def,
      trial_days: plan.trial,
      created_at: now,
    });
    for (const [region, amount] of Object.entries(plan.prices)) {
      const cur = CURRENCY[region];
      if (!cur) continue;
      priceRows.push({
        id: randomUUID(),
        plan_id: planId,
        region_code: region,
        currency_code: cur.code,
        price: amount,
        effective_from: now.slice(0, 10),
        effective_until: null,
        source: "catalog-enrich-2026-08-regions",
        verified: true,
        created_at: now,
      });
    }
  }
}

for (const [region, slugs] of Object.entries(RANK)) {
  slugs.forEach((slug, i) => {
    const service = bySlug[slug];
    if (!service) return;
    // only if we have at least one price in this region for this service
    const hasPrice = planRows.some(
      (pl) =>
        pl.service_id === service.id &&
        priceRows.some((pr) => pr.plan_id === pl.id && pr.region_code === region)
    );
    if (!hasPrice) return;
    availRows.push({
      service_id: service.id,
      region_code: region,
      is_available: true,
      popularity_rank: i + 1,
      is_region_exclusive: !service.is_global,
      local_name: null,
      created_at: now,
    });
  });
}

// Update icon_name gaps lightly
const ICON_FIX = {
  disney: "disney-plus",
  chatgpt: "robot",
  sonyliv: "play-circle",
  zee5: "television-classic",
  "swiggy-one": "bike-fast",
  "zomato-gold": "food",
  peacock: "peacock",
  "now-tv": "television",
  britbox: "television-box",
  hotstar: "star",
  crave: "television-classic",
  stan: "television",
  max: "play-box",
  globoplay: "television-classic",
  "canal-plus": "television",
  dazn: "soccer",
  "rtl-plus": "television-classic",
  binge: "movie-open",
  kayo: "football",
  abema: "television",
  "u-next": "play-box",
};
const servicesOut = servicesRaw.map((s) => ({
  ...s,
  icon_name: s.icon_name || ICON_FIX[s.slug] || s.icon_name,
  updated_at: now,
}));

const regionsOut = regionsRaw.map((r) => ({
  code: r.code,
  name: r.name,
  default_currency: r.default_currency,
  currency_symbol: CURRENCY[r.code]?.symbol || "$",
  locale_patterns: r.locale_patterns || [],
}));

mkdirSync(pricesDir, { recursive: true });

const packMeta = { version: 2, updatedAt: now, source: "catalog-enrich-2026-08-regions" };

for (const region of Object.keys(CURRENCY)) {
  const cur = CURRENCY[region];
  const regionAvail = availRows
    .filter((a) => a.region_code === region)
    .sort((a, b) => a.popularity_rank - b.popularity_rank);

  const services = [];
  for (const a of regionAvail) {
    const s = servicesOut.find((x) => x.id === a.service_id);
    if (!s) continue;
    const plans = planRows
      .filter((pl) => pl.service_id === s.id)
      .map((pl) => {
        const pr = priceRows.find(
          (p) => p.plan_id === pl.id && p.region_code === region
        );
        if (!pr) return null;
        return {
          id: pl.id,
          name: pl.plan_name,
          billingCycle: pl.billing_cycle,
          isDefault: pl.is_default,
          trialDays: pl.trial_days,
          price: pr.price,
          currency: pr.currency_code,
        };
      })
      .filter(Boolean);
    if (!plans.length) continue;
    services.push({
      id: s.id,
      slug: s.slug,
      name: s.name,
      icon: s.icon,
      iconType: s.icon_type,
      iconName: s.icon_name,
      color: s.color,
      category: s.category,
      websiteUrl: s.website_url,
      isGlobal: s.is_global,
      plans,
      popularityRank: a.popularity_rank,
      isRegional: a.is_region_exclusive,
      localName: a.local_name,
    });
  }

  writeJson(join(pricesDir, `${region}.json`), {
    region,
    currency: cur.code,
    currencySymbol: cur.symbol,
    services,
    lastUpdated: now,
    cacheVersion: packMeta.version,
  });
  console.log(`${region}: ${services.length} services`);
}

writeJson(join(root, "regions.json"), regionsOut);
writeJson(join(root, "services.json"), servicesOut);
writeJson(join(root, "manifest.json"), {
  version: packMeta.version,
  updatedAt: now,
  source: packMeta.source,
  regions: Object.keys(CURRENCY),
  notes:
    "Prices curated from public plan pages / press (Aug 2026). Verify before relying for billing.",
});

// Refresh raw normalized tables for transparency
writeJson(join(rawDir, "regions.json"), regionsOut);
writeJson(join(rawDir, "subscription_services.json"), servicesOut);
writeJson(join(rawDir, "subscription_plans.json"), planRows);
writeJson(join(rawDir, "subscription_prices.json"), priceRows);
writeJson(join(rawDir, "service_availability.json"), availRows);
writeJson(join(rawDir, "_summary.json"), {
  dumpedAt: now,
  enriched: true,
  tables: {
    regions: regionsOut.length,
    subscription_services: servicesOut.length,
    service_availability: availRows.length,
    subscription_plans: planRows.length,
    subscription_prices: priceRows.length,
  },
});

console.log("\nCatalog enriched → src/data/catalog/");
console.log(
  `plans=${planRows.length} prices=${priceRows.length} availability=${availRows.length}`
);
