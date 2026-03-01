import { Router } from "express";
import type { Request, Response } from "../types/handlers";
import { supabase } from "../config/supabase";

const authClient = supabase.auth as {
  signUp: (opts: { email: string; password: string; options?: { data?: { full_name?: string } } }) => Promise<{ data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null }; error: { code?: string; message: string } | null }>;
  signInWithPassword: (opts: { email: string; password: string }) => Promise<{ data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null }; error: { code?: string; message: string } | null }>;
  refreshSession: (opts: { refresh_token: string }) => Promise<{ data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null }; error: { code?: string; message: string } | null }>;
};
import type {
  RegisterBody,
  LoginBody,
  RefreshBody,
  AuthSuccessResponse,
  AuthErrorResponse,
} from "../types/auth";

const router = Router();

function toAuthSuccess(session: { access_token: string; refresh_token: string; expires_at?: number }, user: { id: string; email?: string; user_metadata?: { full_name?: string } }): AuthSuccessResponse {
  const expiresIn = session.expires_at
    ? Math.max(0, Math.floor(session.expires_at - Date.now() / 1000))
    : 3600;
  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
    },
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: expiresIn,
      token_type: "bearer",
    },
  };
}

function toError(code: string, message: string): AuthErrorResponse {
  return { error: { code, message } };
}

/**
 * POST /auth/register
 * Body: { email, password, fullName }
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body as RegisterBody;
    if (!email || !password || typeof fullName !== "string") {
      return res.status(400).json(toError("invalid_body", "email, password, and fullName are required"));
    }

    const { data, error } = await authClient.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      return res.status(400).json(toError(error.code ?? "signup_failed", error.message));
    }

    if (!data.session || !data.user) {
      return res.status(400).json(toError("no_session", "Sign up succeeded but no session returned. Check email confirmation."));
    }

    return res.status(201).json(toAuthSuccess(data.session, data.user));
  } catch (e) {
    console.error("Auth register error:", e);
    return res.status(500).json(toError("server_error", "Registration failed"));
  }
});

/**
 * POST /auth/login
 * Body: { email, password }
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as LoginBody;
    if (!email || !password) {
      return res.status(400).json(toError("invalid_body", "email and password are required"));
    }

    const { data, error } = await authClient.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json(toError(error.code ?? "login_failed", error.message));
    }

    if (!data.session || !data.user) {
      return res.status(401).json(toError("no_session", "Login failed"));
    }

    return res.status(200).json(toAuthSuccess(data.session, data.user));
  } catch (e) {
    console.error("Auth login error:", e);
    return res.status(500).json(toError("server_error", "Login failed"));
  }
});

/**
 * POST /auth/refresh
 * Body: { refresh_token }
 */
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body as RefreshBody;
    if (!refresh_token) {
      return res.status(400).json(toError("invalid_body", "refresh_token is required"));
    }

    const { data, error } = await authClient.refreshSession({ refresh_token });

    if (error) {
      return res.status(401).json(toError(error.code ?? "refresh_failed", error.message));
    }

    if (!data.session || !data.user) {
      return res.status(401).json(toError("no_session", "Refresh failed"));
    }

    return res.status(200).json(toAuthSuccess(data.session, data.user));
  } catch (e) {
    console.error("Auth refresh error:", e);
    return res.status(500).json(toError("server_error", "Refresh failed"));
  }
});

/**
 * POST /auth/logout
 * Client discards tokens locally. Optional body: { refresh_token } for future server-side revoke.
 */
router.post("/logout", (_req: Request, res: Response) => {
  return res.status(200).json({ success: true });
});

export default router;
