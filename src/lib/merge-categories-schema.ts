/**
 * Request/response validation for POST /import/merge-categories.
 * Optimized: request sends only categories; response returns categoryIdMap + categoriesToInsert.
 */
import { z } from "zod";

export const categoryLikeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  parent_id: z.string().nullable().optional(),
}).passthrough();

/** Slim request: only categories (no full backup). */
export const mergeCategoriesSlimBodySchema = z.object({
  backupCategories: z.array(categoryLikeSchema),
  existingCategories: z.array(categoryLikeSchema),
});

export type MergeCategoriesSlimBody = z.infer<typeof mergeCategoriesSlimBodySchema>;

/** Slim response: map + list; client applies map locally. */
export const mergeCategoriesSlimResponseSchema = z.object({
  categoryIdMap: z.record(z.string(), z.string()),
  categoriesToInsert: z.array(categoryLikeSchema),
});

export type MergeCategoriesSlimResponse = z.infer<typeof mergeCategoriesSlimResponseSchema>;
