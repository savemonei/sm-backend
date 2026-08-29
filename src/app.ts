import express from "express";
import cors from "cors";
import type { Request, Response } from "./types/handlers";
import authRoutes from "./routes/auth";
import accountRoutes from "./routes/account";
import meRoutes from "./routes/me";
import aiRoutes from "./routes/ai";
import profileRoutes from "./routes/profile";
import syncRoutes from "./routes/sync";
import subscriptionPricesRoutes from "./routes/subscription-prices";
import goalTemplatesRoutes from "./routes/goal-templates";
import importRoutes from "./routes/import";
import knowledgeRoutes from "./routes/knowledge";
import notificationsRoutes from "./routes/notifications";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());
// Mobile clients often POST with Content-Type: application/json and an empty body (e.g. logout).
app.use((err: unknown, req: Request, _res: Response, next: (err?: unknown) => void) => {
  if (
    err instanceof SyntaxError &&
    "body" in err &&
    (err as { status?: number }).status === 400
  ) {
    req.body = {};
    return next();
  }
  return next(err);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/account", accountRoutes);
app.use("/me", meRoutes);
app.use("/ai", aiRoutes);
app.use("/profile", profileRoutes);
app.use("/sync", syncRoutes);
app.use("/subscription-prices", subscriptionPricesRoutes);
app.use("/goal-templates", goalTemplatesRoutes);
app.use("/import", importRoutes);
app.use("/knowledge", knowledgeRoutes);
app.use("/notifications", notificationsRoutes);

export default app;
