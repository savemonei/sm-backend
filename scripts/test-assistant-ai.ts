/**
 * Backend assistant schema / parser unit checks (no OpenRouter calls).
 * Run: pnpm run test:assistant
 */

import assert from "node:assert/strict";
import {
  AssistantPlanRequestSchema,
  AssistantReasonRequestSchema,
  PlannerResultSchema,
} from "../src/types/assistant-ai";
import {
  extractJsonObject,
  parsePlannerResult,
} from "../src/lib/assistant-handler";

function ok(label: string) {
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${label}`);
}

function main() {
  // eslint-disable-next-line no-console
  console.log("assistant schema tests");

  const validPlan = {
    intent: "GET_MONTHLY_SPENDING",
    confidence: 0.9,
    tool: "FETCH_SPENDING",
    parameters: { period: "THIS_MONTH" },
    requiresDatabase: true,
    requiresKnowledge: false,
    requiresReasoning: false,
    requiresConfirmation: false,
    missingFields: [],
    response: "Here is your spending.",
  };
  const parsed = PlannerResultSchema.safeParse(validPlan);
  assert.equal(parsed.success, true);
  ok("PlannerResultSchema accepts valid plan");

  const partialFlags = PlannerResultSchema.safeParse({
    intent: "APP_HELP",
    confidence: 0.8,
    tool: "SHOW_HELP",
    parameters: {},
    requiresDatabase: false,
    requiresConfirmation: false,
    response: "Tips to save money",
  });
  assert.equal(partialFlags.success, true);
  if (partialFlags.success) {
    assert.equal(partialFlags.data.requiresKnowledge, false);
    assert.equal(partialFlags.data.requiresReasoning, false);
  }
  ok("PlannerResultSchema defaults omitted requires* flags");

  const bad = PlannerResultSchema.safeParse({
    ...validPlan,
    tool: "NOPE",
    confidence: 2,
  });
  assert.equal(bad.success, false);
  ok("PlannerResultSchema rejects invalid tool/confidence");

  const fenced = parsePlannerResult(
    '```json\n' + JSON.stringify(validPlan) + "\n```"
  );
  assert.equal(fenced.ok, true);
  ok("parsePlannerResult strips markdown fences");

  const extracted = extractJsonObject('prefix {"a":1} suffix');
  assert.equal(JSON.parse(extracted).a, 1);
  ok("extractJsonObject finds object in prose");

  const req = AssistantPlanRequestSchema.safeParse({
    query: "How much did I spend?",
    context: {
      currentDate: "2026-08-06",
      accounts: [{ id: "1", name: "Cash" }],
    },
  });
  assert.equal(req.success, true);
  ok("AssistantPlanRequestSchema accepts plan request");

  const reason = AssistantReasonRequestSchema.safeParse({
    query: "How much?",
    executionSummary: "amount=100",
  });
  assert.equal(reason.success, true);
  ok("AssistantReasonRequestSchema accepts reason request");

  const emptyQuery = AssistantPlanRequestSchema.safeParse({ query: "" });
  assert.equal(emptyQuery.success, false);
  ok("AssistantPlanRequestSchema rejects empty query");

  // eslint-disable-next-line no-console
  console.log("all assistant schema tests passed");
}

main();
