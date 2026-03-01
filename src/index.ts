import "dotenv/config";
import app from "./app";

const PORT = process.env.PORT ?? 4000;
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());

app.listen(PORT, () => {
  console.log(`savemonei-backend running at http://localhost:${PORT}`);
  console.log(`OPENAI_API_KEY loaded: ${hasOpenAIKey ? "yes" : "no"}`);
});
