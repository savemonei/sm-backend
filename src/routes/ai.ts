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

export default router;
