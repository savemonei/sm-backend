/**
 * Import helpers: Money Manager category map + merge categories.
 * Merge uses slim request/response (categories only + map) to avoid large payloads.
 */
import { Router, type Request, type Response } from "express";
import { getFullMoneyManagerCategoryMap } from "../lib/money-manager-category-map";
import { computeCategoryMerge } from "../lib/merge-categories";
import { mergeCategoriesSlimBodySchema } from "../lib/merge-categories-schema";

const router = Router();

router.get("/money-manager-category-map", (_req: Request, res: Response) => {
  const map = getFullMoneyManagerCategoryMap();
  return res.status(200).json({ map });
});

router.post("/merge-categories", (req: Request, res: Response) => {
  const parsed = mergeCategoriesSlimBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const message = first?.backupCategories?.[0] ?? first?.existingCategories?.[0] ?? parsed.error.message;
    return res.status(400).json({
      error: { code: "bad_request", message: String(message) },
    });
  }
  const { backupCategories, existingCategories } = parsed.data;
  try {
    const { categoryIdMap, categoriesToInsert } = computeCategoryMerge(backupCategories, existingCategories);
    return res.status(200).json({ categoryIdMap, categoriesToInsert });
  } catch (e) {
    console.error("[import/merge-categories]", e);
    return res.status(500).json({
      error: { code: "server_error", message: "Merge failed." },
    });
  }
});

export default router;
