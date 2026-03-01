import express from "express";
import cors from "cors";
import type { Request, Response } from "./types/handlers";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import aiRoutes from "./routes/ai";
import profileRoutes from "./routes/profile";
import syncRoutes from "./routes/sync";
import subscriptionPricesRoutes from "./routes/subscription-prices";
import importRoutes from "./routes/import";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/ai", aiRoutes);
app.use("/profile", profileRoutes);
app.use("/sync", syncRoutes);
app.use("/subscription-prices", subscriptionPricesRoutes);
app.use("/import", importRoutes);

export default app;
