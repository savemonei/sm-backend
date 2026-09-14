import { authClient } from "./auth-client";

/** Hardcoded Play / QA review account — OTP only in the app; no email is sent. */
export const PLAY_REVIEW_EMAIL = "test@spoold.com";
export const PLAY_REVIEW_OTP = "12345678";

/** Server-only password (must match the user created in Supabase Auth). */
const PLAY_REVIEW_INTERNAL_PASSWORD = "SpooldReviewTest!8642";

export function isPlayReviewEmail(email: string): boolean {
  return email.trim().toLowerCase() === PLAY_REVIEW_EMAIL;
}

export function isPlayReviewOtp(token: string): boolean {
  return token.trim() === PLAY_REVIEW_OTP;
}

/** Signs in the pre-created review user after static OTP validation. */
export async function signInPlayReviewUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await authClient.signInWithPassword({
    email: normalizedEmail,
    password: PLAY_REVIEW_INTERNAL_PASSWORD,
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || "Review sign-in failed.");
  }

  return data;
}
