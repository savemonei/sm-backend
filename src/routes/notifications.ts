/**
 * Notification config — templates/rules for local bill & due reminders.
 * GET /notifications/config
 * Public (no PII). App schedules local notifications from on-device data.
 */
import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Request, Response } from "../types/handlers";

const router = Router();

function configPaths(): string[] {
  return [
    join(process.cwd(), "dist", "data", "notifications", "config.json"),
    join(process.cwd(), "src", "data", "notifications", "config.json"),
  ];
}

function loadConfigRaw(): { json: string; path: string } | null {
  for (const path of configPaths()) {
    if (existsSync(path)) {
      return { json: readFileSync(path, "utf8"), path };
    }
  }
  return null;
}

router.get("/config", (req: Request, res: Response) => {
  try {
    const loaded = loadConfigRaw();
    if (!loaded) {
      return res.status(503).json({
        error: {
          code: "notifications_not_built",
          message: "Notification config missing. Run pnpm notifications:build",
        },
      });
    }

    const etag = `"${createHash("sha1").update(loaded.json).digest("hex").slice(0, 16)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    const data = JSON.parse(loaded.json);
    return res.status(200).json(data);
  } catch (e) {
    console.error("[notifications] config error:", e);
    return res.status(500).json({
      error: { code: "server_error", message: "Failed to load notification config." },
    });
  }
});

export default router;
