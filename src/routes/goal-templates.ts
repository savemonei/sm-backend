/**
 * Goal templates – reads from local JSON packs (no user goal data).
 * GET /goal-templates?region=XX
 */
import { Router, type Request, type Response } from "express";
import {
  getGoalTemplatesManifest,
  getGoalTemplatesPack,
  resolveGoalRegion,
} from "../lib/goal-templates";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const requested = ((req.query.region as string) || "US").toUpperCase();
  const region = resolveGoalRegion(requested);

  try {
    const pack = getGoalTemplatesPack(region);
    if (!pack) {
      return res.status(404).json({
        error: {
          code: "region_not_found",
          message: `No goal template pack for region ${requested}.`,
        },
      });
    }

    let cacheVersion = pack.cacheVersion;
    try {
      cacheVersion = getGoalTemplatesManifest().version ?? pack.cacheVersion;
    } catch {
      /* ignore */
    }

    return res.status(200).json({
      region: pack.region,
      currency: pack.currency,
      templates: pack.templates,
      featured: pack.featured,
      lastUpdated: pack.lastUpdated,
      cacheVersion,
      resolvedFrom: requested !== region ? requested : undefined,
    });
  } catch (e) {
    console.error("[goal-templates] error:", e);
    return res.status(500).json({
      error: {
        code: "server_error",
        message: "Failed to load goal templates.",
      },
    });
  }
});

export default router;
