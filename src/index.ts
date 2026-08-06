import "dotenv/config";
import app from "./app";
import { getOpenRouterConfig, isOpenRouterConfigured } from "./config/openrouter";

const PORT = process.env.PORT ?? 4000;
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());
const openRouter = getOpenRouterConfig();

app.listen(PORT, () => {
  console.log(`savemonei-backend running at http://localhost:${PORT}`);
  console.log(`OPENAI_API_KEY loaded: ${hasOpenAIKey ? "yes" : "no"}`);
  console.log(
    `OPENROUTER_API_KEY loaded: ${isOpenRouterConfigured() ? "yes" : "no"}` +
      ` | planner=[${openRouter.plannerModels.join(", ")}]` +
      ` | reasoner=[${openRouter.reasonerModels.join(", ")}]`
  );
});
