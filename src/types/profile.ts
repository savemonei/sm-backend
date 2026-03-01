/**
 * User profile types – must match savemonei-mobile lib/profile-types.ts
 */

export type LifeStage =
  | "student"
  | "just_started_earning"
  | "building_career"
  | "married_partner"
  | "have_kids"
  | "single_parent"
  | "planning_retirement"
  | "retired";

export type PrimaryGoal =
  | "emergency_fund"
  | "pay_debt"
  | "save_big"
  | "invest"
  | "track_spending"
  | "plan_kids_retirement"
  | "organize";

export type UseCase =
  | "spending_only"
  | "spending_goals"
  | "with_documents"
  | "full";

export interface UserProfile {
  user_id: string;
  life_stages: LifeStage[];
  primary_goals: PrimaryGoal[];
  use_case: UseCase | null;
  birth_year: number | null;
  gender: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape from Supabase user_profiles table. life_stage column holds JSON array. */
export interface UserProfileRow {
  user_id: string;
  life_stage: string | null;
  primary_goals: unknown;
  use_case: string | null;
  birth_year: number | null;
  gender: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
}
