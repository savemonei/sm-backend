/**
 * AI route request/response types.
 * All context is abstracted: no raw transactions, account names, or PII.
 */

export type AiIntent = "monthly_insight" | "category_suggestion" | "goal_tip";

/** Abstracted context for monthly insight (aggregates only) */
export interface MonthlyInsightContext {
  categoryCounts: Record<string, number>;
  totalExpense: number;
  totalIncome: number;
  budgetsOverLimit: number;
  dateRange: string;
  currency?: string;
}

/** Context for category suggestion (single item, no IDs) */
export interface CategorySuggestionContext {
  merchant: string;
  amount: number;
  currency?: string;
}

/** Abstracted context for goal tips */
export interface GoalTipContext {
  goalsCount: number;
  totalRemaining: number;
  activeGoalsSummary: string[];
  dateRange: string;
}

export type AiContext = MonthlyInsightContext | CategorySuggestionContext | GoalTipContext;

export interface AiAskRequest {
  intent: AiIntent;
  context: AiContext;
}

export interface AiAskResponse {
  text?: string;
  suggestion?: string;
  confidence?: number;
}
