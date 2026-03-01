import { supabase } from "../config/supabase";
import type { RequestWithUser, Response, NextFunction } from "../types/handlers";

export interface AuthUser {
  id: string;
  email?: string;
}

// Use type assertion for Supabase auth (avoids type mismatches across @supabase/supabase-js versions)
const auth = supabase.auth as {
  getUser: (jwt: string) => Promise<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>;
};

/**
 * Verifies Supabase JWT from Authorization: Bearer <token>.
 * Sets req.user for use in protected routes.
 */
export async function requireAuth(
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    res.status(401).json({
      error: { code: "unauthorized", message: "Missing or invalid Authorization header" },
    });
    return;
  }

  try {
    const {
      data: { user },
      error,
    } = await auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        error: { code: "invalid_token", message: error?.message ?? "Invalid or expired token" },
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
    };
    next();
  } catch (e) {
    console.error("Auth middleware error:", e);
    res.status(500).json({
      error: { code: "server_error", message: "Authentication failed" },
    });
  }
}
