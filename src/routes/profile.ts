import { Router } from "express";
import type { RequestWithUser, Response } from "../types/handlers";
import { requireAuth } from "../middleware/auth";
import { supabaseAdmin } from "../config/supabase";
import type { UserProfile, UserProfileRow, LifeStage } from "../types/profile";

const router = Router();
const TABLE = "user_profiles";

function parseLifeStages(raw: string | null): LifeStage[] {
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? (arr as LifeStage[]).filter(Boolean) : [];
    } catch {
      return [raw as LifeStage];
    }
  }
  return [raw as LifeStage];
}

function rowToProfile(row: UserProfileRow): UserProfile {
  return {
    user_id: row.user_id,
    life_stages: parseLifeStages(row.life_stage),
    primary_goals: Array.isArray(row.primary_goals) ? (row.primary_goals as UserProfile["primary_goals"]) : [],
    use_case: row.use_case as UserProfile["use_case"],
    birth_year: row.birth_year,
    gender: row.gender,
    profile_completed_at: row.profile_completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get("/", requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: "unauthorized", message: "Not authenticated" },
    });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: {
        code: "unconfigured",
        message: "Profile storage not configured. Set SUPABASE_SERVICE_ROLE_KEY and create user_profiles table.",
      },
    });
  }
  const userId = req.user.id;
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profile] GET error:", error);
    return res.status(500).json({
      error: { code: "server_error", message: "Failed to load profile" },
    });
  }
  return res.status(200).json({
    profile: data ? rowToProfile(data as UserProfileRow) : null,
  });
});

router.put("/", requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: "unauthorized", message: "Not authenticated" },
    });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: {
        code: "unconfigured",
        message: "Profile storage not configured. Set SUPABASE_SERVICE_ROLE_KEY and create user_profiles table.",
      },
    });
  }
  const userId = req.user.id;
  const body = req.body as Record<string, unknown>;
  if (body.user_id && body.user_id !== userId) {
    return res.status(403).json({
      error: { code: "forbidden", message: "user_id must match authenticated user" },
    });
  }
  const now = new Date().toISOString();
  const life_stages = Array.isArray(body.life_stages) ? (body.life_stages as LifeStage[]).filter(Boolean) : [];
  const row = {
    user_id: userId,
    life_stage: life_stages.length > 0 ? JSON.stringify(life_stages) : null,
    primary_goals: Array.isArray(body.primary_goals) ? body.primary_goals : [],
    use_case: body.use_case ?? null,
    birth_year: typeof body.birth_year === "number" ? body.birth_year : null,
    gender: typeof body.gender === "string" ? body.gender : null,
    profile_completed_at: typeof body.profile_completed_at === "string" ? body.profile_completed_at : null,
    updated_at: now,
  };

  const { error } = await supabaseAdmin.from(TABLE).upsert(row, {
    onConflict: "user_id",
  });

  if (error) {
    console.error("[profile] PUT error:", error);
    return res.status(500).json({
      error: { code: "server_error", message: "Failed to save profile" },
    });
  }
  const { data } = await supabaseAdmin.from(TABLE).select("*").eq("user_id", userId).single();
  return res.status(200).json({
    profile: data ? rowToProfile(data as UserProfileRow) : null,
  });
});

export default router;
