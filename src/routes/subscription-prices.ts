/**
 * Subscription pricing – reads from local JSON catalog (no Supabase).
 * GET /subscription-prices?region=XX
 */
import { Router, type Request, type Response } from "express";
import { getCatalogManifest, getRegionPack } from "../lib/catalog";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const region = ((req.query.region as string) || "US").toUpperCase();

  try {
    const pack = getRegionPack(region);
    if (!pack) {
      return res.status(404).json({
        error: {
          code: "region_not_found",
          message: `No catalog pack for region ${region}.`,
        },
      });
    }

    let cacheVersion = pack.cacheVersion;
    try {
      cacheVersion = getCatalogManifest().version ?? pack.cacheVersion;
    } catch {
      /* ignore */
    }

    return res.status(200).json({
      region: pack.region,
      currency: pack.currency,
      currencySymbol: pack.currencySymbol,
      services: pack.services,
      lastUpdated: pack.lastUpdated,
      cacheVersion,
    });
  } catch (e) {
    console.error("[subscription-prices] error:", e);
    return res.status(500).json({
      error: {
        code: "server_error",
        message: "Failed to load subscription catalog.",
      },
    });
  }
});

export default router;
