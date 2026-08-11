import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Anon auth client used for signup/login/refresh/password recovery.
 * Persist/auto-refresh disabled — the mobile app owns the session.
 */
export const authClient = supabase.auth;

/**
 * User-scoped client authenticated with the caller's access token.
 * Used for updateUser / signOut against the user's JWT.
 */
export function createUserAuthClient(accessToken: string): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase config");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  return authHeader.slice(7).trim() || undefined;
}

/** Generic success messages that avoid account enumeration. */
export const SAFE_EMAIL_SENT =
  "If an account exists for that email, you will receive a message shortly. Please check your inbox.";
