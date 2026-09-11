import { supabaseAdmin } from "../config/supabase";
import type { UserProfile, UserProfileRow } from "../types/profile";
import type { LifeStage } from "../types/profile";

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

export function rowToProfile(row: UserProfileRow): UserProfile {
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

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return rowToProfile(data as UserProfileRow);
}
