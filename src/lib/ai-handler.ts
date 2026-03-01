/**
 * Shared AI request handling: prompts, OpenAI call, response shape.
 * Used by src/routes/ai.ts (and api can mirror or require this if structure allows).
 */

import OpenAI from "openai";
import type {
  AiAskRequest,
  AiAskResponse,
  AiIntent,
  MonthlyInsightContext,
  CategorySuggestionContext,
  GoalTipContext,
} from "../types/ai";

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 300;
export const VALID_INTENTS: AiIntent[] = ["monthly_insight", "category_suggestion", "goal_tip"];

const SYSTEM_PROMPT = `You are a helpful financial assistant. You receive only abstracted, anonymized context (no raw transactions, account names, or personal data). Answer solely from the provided context. Do not store or refer to any data beyond what is in the request. Keep responses concise and actionable.`;

let cachedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

export function buildUserPrompt(intent: AiIntent, context: AiAskRequest["context"]): string {
  switch (intent) {
    case "monthly_insight": {
      const c = context as MonthlyInsightContext;
      return `Generate a short monthly spending insight (2-4 sentences) based on this abstracted summary. Do not invent numbers.\nCategory counts (expense): ${JSON.stringify(c.categoryCounts)}\nTotal expense: ${c.totalExpense}, Total income: ${c.totalIncome}\nBudgets over limit: ${c.budgetsOverLimit}\nDate range: ${c.dateRange}${c.currency ? `\nCurrency: ${c.currency}` : ""}`;
    }
    case "category_suggestion": {
      const c = context as CategorySuggestionContext;
      return `Suggest a single category label for this transaction (e.g. "Subscription", "Food", "Transport"). Reply with only the category name, no explanation.\nMerchant: ${c.merchant}\nAmount: ${c.amount}${c.currency ? ` ${c.currency}` : ""}`;
    }
    case "goal_tip": {
      const c = context as GoalTipContext;
      return `Give one short tip or encouragement for their savings goals (1-2 sentences).\nActive goals count: ${c.goalsCount}, Total remaining to reach goals: ${c.totalRemaining}\nSummary: ${c.activeGoalsSummary.join("; ")}\nDate range: ${c.dateRange}`;
    }
    default:
      return "No valid intent.";
  }
}

export async function callOpenAI(userPrompt: string): Promise<string> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OPENAI_API_KEY not configured");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: MAX_TOKENS,
  });

  const raw = completion.choices[0]?.message?.content;
  const content = (typeof raw === "string" ? raw : "").trim();
  if (!content) {
    throw new Error(`Empty response (finish_reason: ${completion.choices[0]?.finish_reason ?? "unknown"})`);
  }
  return content;
}

export function buildAiResponse(intent: AiIntent, content: string): AiAskResponse {
  return intent === "category_suggestion"
    ? { suggestion: content.split("\n")[0].trim(), confidence: 0.85 }
    : { text: content };
}

export interface AiErrorResponse {
  status: number;
  body: { error: { code: string; message: string } };
}

export function errorToResponse(e: unknown): AiErrorResponse {
  const err = e as { status?: number; message?: string; error?: { message?: string } };
  const message = err?.message ?? err?.error?.message ?? String(e);

  if (err?.status === 401) {
    return { status: 502, body: { error: { code: "invalid_api_key", message: "Invalid OpenAI API key" } } };
  }
  if (err?.status === 429) {
    return { status: 529, body: { error: { code: "rate_limit", message: "OpenAI rate limit exceeded" } } };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "server_error",
        message: process.env.NODE_ENV === "development" ? message : "AI request failed",
      },
    },
  };
}
