/**
 * OpenRouter AIService — non-streaming chat completions with ordered model fallback.
 * Used by assistant plan/reason routes. Business logic stays model-agnostic.
 */

import {
  getModelsForRole,
  getOpenRouterConfig,
  isOpenRouterConfigured,
  type OpenRouterRole,
} from "../config/openrouter";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterChatRequest = {
  role: OpenRouterRole;
  messages: ChatMessage[];
  /** Optional override; defaults to role chain from config. */
  models?: string[];
  requestId?: string;
  /** Extra body fields (e.g. response_format) — stream is always forced false. */
  extras?: Record<string, unknown>;
};

export type ModelAttempt = {
  model: string;
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  status?: number;
};

export type OpenRouterUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type OpenRouterChatSuccess = {
  ok: true;
  content: string;
  modelUsed: string;
  modelsAttempted: string[];
  attempts: ModelAttempt[];
  latencyMs: number;
  usage: OpenRouterUsage;
  requestId: string;
  role: OpenRouterRole;
};

export type OpenRouterChatFailure = {
  ok: false;
  errorCode: string;
  message: string;
  modelsAttempted: string[];
  attempts: ModelAttempt[];
  latencyMs: number;
  requestId: string;
  role: OpenRouterRole;
};

export type OpenRouterChatResult = OpenRouterChatSuccess | OpenRouterChatFailure;

type OpenRouterApiResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string | null; role?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string | number };
};

function newRequestId(): string {
  return `or_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function classifyFetchError(err: unknown): { code: string; message: string; transient: boolean } {
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return { code: "timeout", message: "OpenRouter request timed out", transient: true };
    }
    return { code: "network_error", message: err.message || "Network error", transient: true };
  }
  return { code: "unknown_error", message: String(err), transient: true };
}

function logAttempt(payload: Record<string, unknown>): void {
  // Structured single-line log for Vercel / local — no message bodies / PII.
  console.log(JSON.stringify({ scope: "openrouter", ...payload }));
}

async function callOpenRouterOnce(params: {
  model: string;
  messages: ChatMessage[];
  extras?: Record<string, unknown>;
  timeoutMs: number;
  apiKey: string;
  baseUrl: string;
  httpReferer: string;
  appTitle: string;
}): Promise<{
  status: number;
  content?: string;
  model?: string;
  usage: OpenRouterUsage;
  errorCode?: string;
  errorMessage?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const res = await fetch(params.baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": params.httpReferer,
        "X-Title": params.appTitle,
      },
      body: JSON.stringify({
        ...params.extras,
        model: params.model,
        messages: params.messages,
        stream: false,
      }),
    });

    const rawText = await res.text();
    let data: OpenRouterApiResponse = {};
    try {
      data = rawText ? (JSON.parse(rawText) as OpenRouterApiResponse) : {};
    } catch {
      return {
        status: res.status,
        usage: {},
        errorCode: "invalid_json",
        errorMessage: "OpenRouter returned non-JSON body",
      };
    }

    if (!res.ok) {
      const msg =
        data.error?.message ||
        (typeof data.error === "string" ? data.error : null) ||
        `OpenRouter HTTP ${res.status}`;
      return {
        status: res.status,
        usage: {},
        errorCode: String(data.error?.code ?? `http_${res.status}`),
        errorMessage: msg,
      };
    }

    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      return {
        status: res.status,
        model: data.model ?? params.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
        errorCode: "empty_response",
        errorMessage: `Empty response (finish_reason: ${data.choices?.[0]?.finish_reason ?? "unknown"})`,
      };
    }

    return {
      status: res.status,
      content,
      model: data.model ?? params.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a chat completion across the configured model chain.
 * Same-model retries for transient errors, then advance to the next model.
 */
export async function openRouterChat(
  request: OpenRouterChatRequest
): Promise<OpenRouterChatResult> {
  const started = Date.now();
  const requestId = request.requestId ?? newRequestId();
  const role = request.role;
  const cfg = getOpenRouterConfig();
  const models =
    request.models && request.models.length > 0
      ? request.models
      : getModelsForRole(role);

  if (!cfg.apiKey) {
    const result: OpenRouterChatFailure = {
      ok: false,
      errorCode: "unconfigured",
      message: "OPENROUTER_API_KEY is not configured",
      modelsAttempted: [],
      attempts: [],
      latencyMs: Date.now() - started,
      requestId,
      role,
    };
    logAttempt({
      requestId,
      role,
      event: "unconfigured",
      latencyMs: result.latencyMs,
    });
    return result;
  }

  if (models.length === 0) {
    return {
      ok: false,
      errorCode: "no_models",
      message: "No OpenRouter models configured",
      modelsAttempted: [],
      attempts: [],
      latencyMs: Date.now() - started,
      requestId,
      role,
    };
  }

  const attempts: ModelAttempt[] = [];
  const modelsAttempted: string[] = [];

  for (const model of models) {
    modelsAttempted.push(model);
    let advanced = false;

    for (let retry = 0; retry <= cfg.maxRetriesPerModel; retry++) {
      const attemptStarted = Date.now();
      try {
        const outcome = await callOpenRouterOnce({
          model,
          messages: request.messages,
          extras: request.extras,
          timeoutMs: cfg.timeoutMs,
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          httpReferer: cfg.httpReferer,
          appTitle: cfg.appTitle,
        });

        const latencyMs = Date.now() - attemptStarted;

        if (outcome.content) {
          const attempt: ModelAttempt = {
            model,
            ok: true,
            latencyMs,
            status: outcome.status,
          };
          attempts.push(attempt);
          logAttempt({
            requestId,
            role,
            event: "success",
            model,
            modelReported: outcome.model,
            retry,
            latencyMs,
            promptTokens: outcome.usage.promptTokens,
            completionTokens: outcome.usage.completionTokens,
            totalTokens: outcome.usage.totalTokens,
            modelsAttempted,
          });

          return {
            ok: true,
            content: outcome.content,
            modelUsed: outcome.model ?? model,
            modelsAttempted,
            attempts,
            latencyMs: Date.now() - started,
            usage: outcome.usage,
            requestId,
            role,
          };
        }

        const transient = isTransientStatus(outcome.status) || outcome.errorCode === "empty_response";
        attempts.push({
          model,
          ok: false,
          latencyMs,
          status: outcome.status,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
        });
        logAttempt({
          requestId,
          role,
          event: "attempt_failed",
          model,
          retry,
          latencyMs,
          status: outcome.status,
          errorCode: outcome.errorCode,
          transient,
        });

        if (transient && retry < cfg.maxRetriesPerModel) {
          await sleep(300 * (retry + 1));
          continue;
        }
        // Hard failure or retries exhausted → next model
        advanced = true;
        break;
      } catch (err) {
        const latencyMs = Date.now() - attemptStarted;
        const classified = classifyFetchError(err);
        attempts.push({
          model,
          ok: false,
          latencyMs,
          errorCode: classified.code,
          errorMessage: classified.message,
        });
        logAttempt({
          requestId,
          role,
          event: "attempt_failed",
          model,
          retry,
          latencyMs,
          errorCode: classified.code,
          transient: classified.transient,
        });

        if (classified.transient && retry < cfg.maxRetriesPerModel) {
          await sleep(300 * (retry + 1));
          continue;
        }
        advanced = true;
        break;
      }
    }

    if (!advanced) {
      // loop naturally continues to next model
    }
  }

  const latencyMs = Date.now() - started;
  const last = attempts[attempts.length - 1];
  const result: OpenRouterChatFailure = {
    ok: false,
    errorCode: last?.errorCode ?? "all_models_failed",
    message: last?.errorMessage ?? "All OpenRouter models failed",
    modelsAttempted,
    attempts,
    latencyMs,
    requestId,
    role,
  };
  logAttempt({
    requestId,
    role,
    event: "all_models_failed",
    latencyMs,
    modelsAttempted,
    errorCode: result.errorCode,
  });
  return result;
}

export { isOpenRouterConfigured, getOpenRouterConfig, getModelsForRole };
