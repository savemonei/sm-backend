import { Router } from "express";
import type { RequestWithUser, Response } from "../types/handlers";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /me
 * Returns current user (requires valid Bearer token).
 */
router.get("/", requireAuth, (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: "unauthorized", message: "Not authenticated" },
    });
  }
  return res.status(200).json({
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
});

export default router;
