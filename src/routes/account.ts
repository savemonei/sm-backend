import { Router } from "express";
import type { RequestWithUser, Response } from "../types/handlers";
import { requireAuth } from "../middleware/auth";
import { supabaseAdmin } from "../config/supabase";
import { authClient } from "../lib/auth-client";
import type { DeleteAccountBody, AuthErrorResponse, AuthOkResponse } from "../types/auth";

const router = Router();

function toError(code: string, message: string): AuthErrorResponse {
  return { error: { code, message } };
}

/**
 * DELETE /account
 * Body: { password }
 * Verifies password, deletes profile + sync tokens + Auth user (server-side only).
 */
router.delete("/", requireAuth, async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json(toError("unauthorized", "Not authenticated"));
    }
    if (!supabaseAdmin) {
      return res.status(503).json(
        toError(
          "unconfigured",
          "Account deletion is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server."
        )
      );
    }

    const { password } = (req.body || {}) as DeleteAccountBody;
    if (!password || typeof password !== "string") {
      return res.status(400).json(toError("invalid_body", "password is required"));
    }

    const email = req.user.email;
    if (!email) {
      return res.status(400).json(toError("missing_email", "Account email is unavailable"));
    }

    // Re-authenticate before destructive action
    const { error: verifyError } = await authClient.signInWithPassword({
      email,
      password,
    });
    if (verifyError) {
      return res.status(401).json(toError("invalid_credentials", "Incorrect password. Please try again."));
    }

    const userId = req.user.id;

    // Best-effort cleanup of server-side user data (idempotent)
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .delete()
      .eq("user_id", userId);
    if (profileError) {
      console.error("[account] profile delete error:", profileError.message);
    }

    const { error: tokensError } = await supabaseAdmin
      .from("user_tokens")
      .delete()
      .eq("user_id", userId);
    if (tokensError) {
      console.error("[account] tokens delete error:", tokensError.message);
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      // Treat "already deleted" as success for idempotency
      const msg = deleteUserError.message?.toLowerCase() ?? "";
      if (!msg.includes("not found") && !msg.includes("user not found")) {
        console.error("[account] auth deleteUser error:", deleteUserError);
        return res.status(500).json(toError("delete_failed", "Failed to delete account. Please try again."));
      }
    }

    const body: AuthOkResponse = {
      success: true,
      message: "Your account has been deleted.",
    };
    return res.status(200).json(body);
  } catch (e) {
    console.error("[account] DELETE error:", e);
    return res.status(500).json(toError("server_error", "Failed to delete account"));
  }
});

export default router;
