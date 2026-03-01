import { Router } from "express";
import type { RequestWithUser, Response } from "../types/handlers";
import { requireAuth } from "../middleware/auth";
import { supabaseAdmin } from "../config/supabase";

const router = Router();
const TABLE = "user_tokens";

router.get("/tokens", requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: { code: "unauthorized", message: "Not authenticated" } });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: { code: "unconfigured", message: "Sync storage not configured (SUPABASE_SERVICE_ROLE_KEY)." },
    });
  }
  const provider = (req.query.provider as string) || "google";
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("user_id", req.user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    console.error("[sync] GET tokens error:", error);
    return res.status(500).json({ error: { code: "server_error", message: "Failed to load tokens" } });
  }
  return res.status(200).json({ tokens: data });
});

router.put("/tokens", requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: { code: "unauthorized", message: "Not authenticated" } });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: { code: "unconfigured", message: "Sync storage not configured (SUPABASE_SERVICE_ROLE_KEY)." },
    });
  }
  const body = req.body as {
    provider?: string;
    encrypted_access_token?: string;
    encrypted_refresh_token?: string;
    token_expiry?: number;
    provider_user_id?: string;
  };
  const provider = body.provider || "google";
  const now = new Date().toISOString();
  const row = {
    user_id: req.user.id,
    provider,
    encrypted_access_token: body.encrypted_access_token ?? null,
    encrypted_refresh_token: body.encrypted_refresh_token ?? null,
    token_expiry: body.token_expiry ?? null,
    provider_user_id: body.provider_user_id ?? null,
    last_sync_time: now,
    updated_at: now,
  };
  const { error } = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: "user_id,provider" });
  if (error) {
    console.error("[sync] PUT tokens error:", error);
    return res.status(500).json({ error: { code: "server_error", message: "Failed to save tokens" } });
  }
  return res.status(200).json({ success: true });
});

router.delete("/tokens", requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: { code: "unauthorized", message: "Not authenticated" } });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: { code: "unconfigured", message: "Sync storage not configured (SUPABASE_SERVICE_ROLE_KEY)." },
    });
  }
  const provider = (req.query.provider as string) || "google";
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq("user_id", req.user.id)
    .eq("provider", provider);
  if (error) {
    console.error("[sync] DELETE tokens error:", error);
    return res.status(500).json({ error: { code: "server_error", message: "Failed to delete tokens" } });
  }
  return res.status(200).json({ success: true });
});

export default router;
