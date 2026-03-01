/**
 * Subscription pricing – reads from Supabase DB (no Edge Function).
 * GET /subscription-prices?region=XX
 */
import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../config/supabase";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  BRL: "R$",
  MXN: "MX$",
  SGD: "S$",
  AED: "د.إ",
};

// Types for Supabase responses
interface RegionRow {
  code: string;
  default_currency?: string;
  [k: string]: unknown;
}

interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  icon_type: string | null;
  icon_name: string | null;
  color: string | null;
  category: string | null;
  website_url: string | null;
  is_global: boolean;
}

interface AvailabilityRow {
  service_id: string;
  popularity_rank: number;
  is_region_exclusive: boolean;
  local_name: string | null;
  subscription_services: ServiceRow | null;
}

interface PriceRow {
  price: number;
  currency_code: string;
}

interface PlanRow {
  id: string;
  service_id: string;
  plan_name: string;
  billing_cycle: string;
  is_default: boolean | null;
  trial_days: number | null;
  subscription_prices: PriceRow[] | null;
}

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const region = (req.query.region as string) || "US";

  if (!supabaseAdmin) {
    return res.status(503).json({
      error: { code: "unconfigured", message: "Subscription prices not configured (SUPABASE_SERVICE_ROLE_KEY)." },
    });
  }

  try {
    // Region info
    const { data: regionData } = await supabaseAdmin
      .from("regions")
      .select("*")
      .eq("code", region)
      .maybeSingle();

    const r = (regionData as RegionRow | null) || null;
    const currency = r?.default_currency || "USD";
    const currencySymbol = CURRENCY_SYMBOLS[currency] || "$";

    // Regional availability + service details
    const { data: availabilityData } = await supabaseAdmin
      .from("service_availability")
      .select(
        `
        service_id,
        popularity_rank,
        is_region_exclusive,
        local_name,
        subscription_services!inner (
          id,
          slug,
          name,
          icon,
          icon_type,
          icon_name,
          color,
          category,
          website_url,
          is_global
        )
      `
      )
      .eq("region_code", region)
      .eq("is_available", true)
      .order("popularity_rank", { ascending: true });

    const availList = (availabilityData || []) as unknown as AvailabilityRow[];

    // Global services (fallback when no regional data)
    const { data: globalServices } = await supabaseAdmin
      .from("subscription_services")
      .select("*")
      .eq("is_global", true);

    const globalList = (globalServices || []) as ServiceRow[];

    const serviceIds = new Set<string>();
    const services: Array<ServiceRow & { popularityRank: number; isRegional: boolean; localName: string | null }> = [];

    for (const item of availList) {
      const raw = item.subscription_services;
      const service = Array.isArray(raw) ? raw[0] : raw;
      if (service && !serviceIds.has(service.id)) {
        serviceIds.add(service.id);
        services.push({
          ...service,
          popularityRank: item.popularity_rank,
          isRegional: item.is_region_exclusive,
          localName: item.local_name,
        });
      }
    }

    let rank = services.length + 1;
    for (const service of globalList) {
      if (!serviceIds.has(service.id)) {
        serviceIds.add(service.id);
        services.push({
          ...service,
          popularityRank: rank++,
          isRegional: false,
          localName: null,
        });
      }
    }

    const serviceIdsArray = Array.from(serviceIds);
    if (serviceIdsArray.length === 0) {
      return res.status(200).json({
        region,
        currency,
        currencySymbol,
        services: [],
        lastUpdated: new Date().toISOString(),
        cacheVersion: 1,
      });
    }

    // Plans with prices for this region
    const { data: plansData } = await supabaseAdmin
      .from("subscription_plans")
      .select(
        `
        id,
        service_id,
        plan_name,
        billing_cycle,
        is_default,
        trial_days,
        subscription_prices!inner (
          price,
          currency_code
        )
      `
      )
      .in("service_id", serviceIdsArray)
      .eq("subscription_prices.region_code", region)
      .is("subscription_prices.effective_until", null);

    const plansList = (plansData || []) as PlanRow[];
    const plansByService: Record<string, Array<{ id: string; name: string; billingCycle: string; isDefault: boolean | null; trialDays: number | null; price: number; currency: string }>> = {};

    for (const plan of plansList) {
      const serviceId = plan.service_id;
      if (!plansByService[serviceId]) plansByService[serviceId] = [];
      const priceData = Array.isArray(plan.subscription_prices) ? plan.subscription_prices[0] : null;
      plansByService[serviceId].push({
        id: plan.id,
        name: plan.plan_name,
        billingCycle: plan.billing_cycle,
        isDefault: plan.is_default,
        trialDays: plan.trial_days,
        price: priceData?.price ?? 0,
        currency: priceData?.currency_code ?? currency,
      });
    }

    const servicesWithPlans = services
      .map((s) => ({
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
        plans: plansByService[s.id] || [],
        popularityRank: s.popularityRank,
        isRegional: s.isRegional,
        localName: s.localName,
      }))
      .filter((s) => s.plans.length > 0);

    return res.status(200).json({
      region,
      currency,
      currencySymbol,
      services: servicesWithPlans,
      lastUpdated: new Date().toISOString(),
      cacheVersion: 1,
    });
  } catch (e) {
    console.error("[subscription-prices] error:", e);
    return res.status(500).json({
      error: { code: "server_error", message: "Failed to fetch subscription prices." },
    });
  }
});

export default router;
