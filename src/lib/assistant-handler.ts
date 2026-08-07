/**
 * Assistant plan / reason orchestration on top of OpenRouter AIService.
 */

import { openRouterChat, isOpenRouterConfigured } from "./openrouter-ai-service";
import {
  buildPlannerUserContent,
  buildReasonerUserContent,
  getPlannerSystemPrompt,
  getReasonerSystemPrompt,
} from "./assistant-prompts";
import {
  AssistantPlanRequestSchema,
  AssistantReasonRequestSchema,
  PlannerResultSchema,
  PLANNER_PROMPT_VERSION,
  REASONER_PROMPT_VERSION,
  type AssistantMeta,
  type AssistantPlanRequest,
  type AssistantPlanResponse,
  type AssistantReasonRequest,
  type AssistantReasonResponse,
  type PlannerResult,
} from "../types/assistant-ai";

export type HandlerError = {
  status: number;
  body: { error: { code: string; message: string } };
};

/** Verbose request/response logging. Set ASSISTANT_AI_DEBUG=1 (never leave on in prod long-term). */
function isAssistantAiDebug(): boolean {
  const v = process.env.ASSISTANT_AI_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function debugAssistant(payload: Record<string, unknown>): void {
  if (!isAssistantAiDebug()) return;
  console.log(JSON.stringify({ scope: "assistant_debug", ...payload }));
}

/** Strip markdown fences / leading prose so Zod can parse planner JSON. */
export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export function parsePlannerResult(raw: string):
  | { ok: true; plan: PlannerResult }
  | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    return { ok: false, message: "Planner returned invalid JSON" };
  }
  const result = PlannerResultSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      message: `Planner JSON failed validation: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, plan: result.data };
}

function compactContext(context: AssistantPlanRequest["context"]): string {
  // Keep payload small — already validated/sized by Zod.
  return JSON.stringify(context ?? {});
}

function historyJson(
  history: AssistantPlanRequest["history"] | AssistantReasonRequest["history"]
): string | undefined {
  if (!history?.length) return undefined;
  return JSON.stringify(history);
}

function metaFromChat(
  chat: {
    requestId: string;
    modelUsed?: string;
    modelsAttempted: string[];
    latencyMs: number;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  },
  promptVersion: string
): AssistantMeta {
  return {
    requestId: chat.requestId,
    modelUsed: chat.modelUsed ?? chat.modelsAttempted[chat.modelsAttempted.length - 1] ?? "unknown",
    modelsAttempted: chat.modelsAttempted,
    latencyMs: chat.latencyMs,
    promptTokens: chat.usage?.promptTokens,
    completionTokens: chat.usage?.completionTokens,
    totalTokens: chat.usage?.totalTokens,
    promptVersion,
  };
}

export function ensureOpenRouterReady(): HandlerError | null {
  if (!isOpenRouterConfigured()) {
    return {
      status: 503,
      body: {
        error: {
          code: "unconfigured",
          message: "OpenRouter AI service not configured",
        },
      },
    };
  }
  return null;
}

export async function runAssistantPlan(
  body: unknown
): Promise<{ ok: true; data: AssistantPlanResponse } | { ok: false; error: HandlerError }> {
  const parsed = AssistantPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        status: 400,
        body: {
          error: {
            code: "invalid_body",
            message: parsed.error.issues[0]?.message ?? "Invalid plan request",
          },
        },
      },
    };
  }

  const req = parsed.data;
  const messages = [
    { role: "system" as const, content: getPlannerSystemPrompt() },
    {
      role: "user" as const,
      content: buildPlannerUserContent({
        query: req.query,
        contextJson: compactContext(req.context),
        historyJson: historyJson(req.history),
      }),
    },
  ];

  debugAssistant({
    event: "plan_request",
    query: req.query,
    historyTurns: req.history?.length ?? 0,
    contextKeys: Object.keys(req.context ?? {}),
    userPrompt: messages[1]?.content,
  });

  const chat = await openRouterChat({
    role: "planner",
    messages,
    // Encourage JSON without relying on provider-specific response_format support on free models.
    extras: {
      temperature: 0.2,
    },
  });

  if (!chat.ok) {
    debugAssistant({
      event: "plan_error",
      errorCode: chat.errorCode,
      message: chat.message,
      modelsAttempted: chat.modelsAttempted,
      latencyMs: chat.latencyMs,
      requestId: chat.requestId,
    });
    const status =
      chat.errorCode === "unconfigured"
        ? 503
        : chat.errorCode === "timeout"
          ? 504
          : 502;
    return {
      ok: false,
      error: {
        status,
        body: {
          error: {
            code: chat.errorCode,
            message: chat.message,
          },
        },
      },
    };
  }

  const planParsed = parsePlannerResult(chat.content);
  if (!planParsed.ok) {
    debugAssistant({
      event: "plan_invalid_json",
      requestId: chat.requestId,
      modelUsed: chat.modelUsed,
      rawContent: chat.content,
      message: planParsed.message,
    });
    console.log(
      JSON.stringify({
        scope: "assistant",
        event: "planner_invalid_json",
        requestId: chat.requestId,
        modelUsed: chat.modelUsed,
        message: planParsed.message,
      })
    );
    return {
      ok: false,
      error: {
        status: 502,
        body: {
          error: {
            code: "invalid_planner_json",
            message: planParsed.message,
          },
        },
      },
    };
  }

  debugAssistant({
    event: "plan_response",
    requestId: chat.requestId,
    modelUsed: chat.modelUsed,
    latencyMs: chat.latencyMs,
    usage: chat.usage,
    plan: planParsed.plan,
    rawContent: chat.content,
  });

  return {
    ok: true,
    data: {
      plan: planParsed.plan,
      meta: metaFromChat(chat, PLANNER_PROMPT_VERSION),
    },
  };
}

export async function runAssistantReason(
  body: unknown
): Promise<{ ok: true; data: AssistantReasonResponse } | { ok: false; error: HandlerError }> {
  const parsed = AssistantReasonRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        status: 400,
        body: {
          error: {
            code: "invalid_body",
            message: parsed.error.issues[0]?.message ?? "Invalid reason request",
          },
        },
      },
    };
  }

  const req = parsed.data;
  const messages = [
    { role: "system" as const, content: getReasonerSystemPrompt() },
    {
      role: "user" as const,
      content: buildReasonerUserContent({
        query: req.query,
        executionSummary: req.executionSummary,
        historyJson: historyJson(req.history),
      }),
    },
  ];

  debugAssistant({
    event: "reason_request",
    query: req.query,
    executionSummary: req.executionSummary,
    historyTurns: req.history?.length ?? 0,
    userPrompt: messages[1]?.content,
  });

  const chat = await openRouterChat({
    role: "reasoner",
    messages,
    extras: { temperature: 0.4 },
  });

  if (!chat.ok) {
    debugAssistant({
      event: "reason_error",
      errorCode: chat.errorCode,
      message: chat.message,
      modelsAttempted: chat.modelsAttempted,
      latencyMs: chat.latencyMs,
      requestId: chat.requestId,
    });
    const status =
      chat.errorCode === "unconfigured"
        ? 503
        : chat.errorCode === "timeout"
          ? 504
          : 502;
    return {
      ok: false,
      error: {
        status,
        body: {
          error: {
            code: chat.errorCode,
            message: chat.message,
          },
        },
      },
    };
  }

  const text = chat.content.trim();
  if (!text) {
    debugAssistant({
      event: "reason_empty",
      requestId: chat.requestId,
      modelUsed: chat.modelUsed,
      rawContent: chat.content,
    });
    return {
      ok: false,
      error: {
        status: 502,
        body: {
          error: { code: "empty_response", message: "Reasoner returned no content" },
        },
      },
    };
  }

  debugAssistant({
    event: "reason_response",
    requestId: chat.requestId,
    modelUsed: chat.modelUsed,
    latencyMs: chat.latencyMs,
    usage: chat.usage,
    text,
  });

  return {
    ok: true,
    data: {
      text,
      meta: metaFromChat(chat, REASONER_PROMPT_VERSION),
    },
  };
}
