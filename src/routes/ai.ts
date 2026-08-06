import { Router } from "express";
import type { RequestWithUser, Response } from "../types/handlers";
import { requireAuth } from "../middleware/auth";
import type { AiAskRequest } from "../types/ai";
import {
  getOpenAIClient,
  buildUserPrompt,
  callOpenAI,
  buildAiResponse,
  errorToResponse,
  VALID_INTENTS,
} from "../lib/ai-handler";
import { checkAssistantRateLimit } from "../lib/assistant-rate-limit";
import {
  ensureOpenRouterReady,
  runAssistantPlan,
  runAssistantReason,
} from "../lib/assistant-handler";

const router = Router();

router.post("/ask", requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!getOpenAIClient()) {
    console.error("[AI] OPENAI_API_KEY is missing or empty");
    return res.status(503).json({ error: { code: "unconfigured", message: "AI service not configured" } });
  }

  const body = req.body as AiAskRequest;
  const { intent, context } = body;

  if (!intent || !context || !VALID_INTENTS.includes(intent)) {
    return res.status(400).json({
      error: {
        code: "invalid_body",
        message: "intent and context are required; intent must be monthly_insight, category_suggestion, or goal_tip",
      },
    });
  }

  try {
    const userPrompt = buildUserPrompt(intent, context);
    const content = await callOpenAI(userPrompt);
    const response = buildAiResponse(intent, content);
    return res.status(200).json(response);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Empty response")) {
      console.error("[AI] OpenAI returned empty content", { intent });
      return res.status(502).json({ error: { code: "empty_response", message: "AI returned no content" } });
    }
    console.error("[AI] OpenAI request failed:", e);
    const { status, body: errBody } = errorToResponse(e);
    return res.status(status).json(errBody);
  }
});

function applyRateLimit(req: RequestWithUser, res: Response, route: string): boolean {
  const userId = req.user?.id ?? "anonymous";
  const limit = checkAssistantRateLimit(`${userId}:${route}`);
  res.setHeader("X-RateLimit-Limit", String(limit.limit));
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    res.status(429).json({
      error: {
        code: "rate_limit",
        message: "Too many assistant AI requests. Please try again shortly.",
      },
    });
    return false;
  }
  return true;
}

/**
 * Planner: returns validated JSON plan + OpenRouter meta.
 * POST /ai/assistant/plan
 */
router.post("/assistant/plan", requireAuth, async (req: RequestWithUser, res: Response) => {
  const ready = ensureOpenRouterReady();
  if (ready) return res.status(ready.status).json(ready.body);
  if (!applyRateLimit(req, res, "plan")) return;

  try {
    const result = await runAssistantPlan(req.body);
    if (!result.ok) {
      return res.status(result.error.status).json(result.error.body);
    }
    return res.status(200).json(result.data);
  } catch (e) {
    console.error("[AI] assistant plan failed:", e);
    return res.status(500).json({
      error: {
        code: "server_error",
        message: process.env.NODE_ENV === "development" ? String(e) : "Assistant plan failed",
      },
    });
  }
});

/**
 * Reasoner: natural-language answer from local execution summary.
 * POST /ai/assistant/reason
 */
router.post("/assistant/reason", requireAuth, async (req: RequestWithUser, res: Response) => {
  const ready = ensureOpenRouterReady();
  if (ready) return res.status(ready.status).json(ready.body);
  if (!applyRateLimit(req, res, "reason")) return;

  try {
    const result = await runAssistantReason(req.body);
    if (!result.ok) {
      return res.status(result.error.status).json(result.error.body);
    }
    return res.status(200).json(result.data);
  } catch (e) {
    console.error("[AI] assistant reason failed:", e);
    return res.status(500).json({
      error: {
        code: "server_error",
        message: process.env.NODE_ENV === "development" ? String(e) : "Assistant reason failed",
      },
    });
  }
});

export default router;
