/**
 * Assistant Planner / Reasoner request + response schemas (Zod).
 * Shared contract for OpenRouter proxy routes.
 */

import { z } from "zod";

export const PLANNER_PROMPT_VERSION = "planner@v1" as const;
export const REASONER_PROMPT_VERSION = "reasoner@v1" as const;

/** Compact intent enum aligned with mobile NluIntent. */
export const PlannerIntentSchema = z.enum([
  "GET_MONTHLY_SPENDING",
  "GET_MONTHLY_INCOME",
  "COMPARE_MONTHS",
  "GET_CATEGORY_SPENDING",
  "GET_BUDGET_REMAINING",
  "GET_GOAL_PROGRESS",
  "GET_LOAN_BALANCE",
  "GET_SUBSCRIPTION_TOTAL",
  "GET_NETWORTH",
  "GET_UPCOMING_BILLS",
  "GET_LARGEST_TRANSACTION",
  "GET_TOP_MERCHANTS",
  "GET_ACCOUNT_BALANCE",
  "ADD_EXPENSE",
  "ADD_INCOME",
  "EDIT_TRANSACTION",
  "DELETE_TRANSACTION",
  "CREATE_BUDGET",
  "UPDATE_BUDGET",
  "DELETE_BUDGET",
  "CREATE_GOAL",
  "UPDATE_GOAL",
  "CREATE_SUBSCRIPTION",
  "UPDATE_SUBSCRIPTION",
  "SEARCH",
  "QUICK_ACTIONS",
  "APP_HELP",
  "GUIDE",
  "GREETING",
  "THANKS",
  "CAPABILITIES",
  "FINANCIAL_HEALTH",
  "DIAGNOSTICS",
  "TUTORIAL",
  "WHATS_NEW",
  "TROUBLESHOOT",
  "BACKUP_HELP",
  "SETTINGS_HELP",
  "REPORTS_HELP",
  "CLARIFY",
  "UNKNOWN",
  "INVALID",
  "OUT_OF_SCOPE",
]);

export const PlannerToolSchema = z.enum([
  "FETCH_SPENDING",
  "FETCH_INCOME",
  "FETCH_COMPARE",
  "FETCH_CATEGORY_SPENDING",
  "FETCH_BUDGETS",
  "FETCH_GOALS",
  "FETCH_LOANS",
  "FETCH_SUBSCRIPTIONS",
  "FETCH_NETWORTH",
  "FETCH_BILLS",
  "FETCH_LARGEST_TX",
  "FETCH_TOP_MERCHANTS",
  "FETCH_ACCOUNT_BALANCE",
  "CREATE_TRANSACTION",
  "UPDATE_TRANSACTION",
  "DELETE_TRANSACTION",
  "CREATE_BUDGET",
  "UPDATE_BUDGET",
  "DELETE_BUDGET",
  "CREATE_GOAL",
  "UPDATE_GOAL",
  "CREATE_SUBSCRIPTION",
  "UPDATE_SUBSCRIPTION",
  "SHOW_QUICK_ACTIONS",
  "SHOW_SEARCH",
  "SHOW_HELP",
  "SHOW_CLARIFY",
  "NAVIGATE",
  "LEGACY_ROUTE",
  "NOOP",
]);

export const PlannerResultSchema = z.object({
  intent: PlannerIntentSchema,
  confidence: z.number().min(0).max(1),
  tool: PlannerToolSchema,
  parameters: z.record(z.unknown()).default({}),
  requiresDatabase: z.boolean(),
  requiresKnowledge: z.boolean(),
  requiresReasoning: z.boolean(),
  requiresConfirmation: z.boolean(),
  missingFields: z.array(z.string()).default([]),
  response: z.string(),
});

export type PlannerResult = z.infer<typeof PlannerResultSchema>;

export const AssistantHistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

export const AssistantDynamicContextSchema = z.object({
  currentDate: z.string().optional(),
  timezone: z.string().optional(),
  currentScreen: z.string().optional(),
  accounts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string().optional(),
      })
    )
    .max(50)
    .optional(),
  categories: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string().optional(),
      })
    )
    .max(100)
    .optional(),
  enabledFeatures: z.array(z.string()).max(40).optional(),
  relevantAppState: z.record(z.unknown()).optional(),
});

export const AssistantPlanRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  context: AssistantDynamicContextSchema.default({}),
  history: z.array(AssistantHistoryTurnSchema).max(8).optional(),
});

export type AssistantPlanRequest = z.infer<typeof AssistantPlanRequestSchema>;

export const AssistantReasonRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  executionSummary: z.string().min(1).max(8000),
  history: z.array(AssistantHistoryTurnSchema).max(8).optional(),
});

export type AssistantReasonRequest = z.infer<typeof AssistantReasonRequestSchema>;

export type AssistantMeta = {
  requestId: string;
  modelUsed: string;
  modelsAttempted: string[];
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptVersion: string;
};

export type AssistantPlanResponse = {
  plan: PlannerResult;
  meta: AssistantMeta;
};

export type AssistantReasonResponse = {
  text: string;
  meta: AssistantMeta;
};
