import { Router } from "express";
import type { Request, Response } from "../types/handlers";
import { supabase } from "../config/supabase";

const authClient = supabase.auth as {
  signUp: (opts: { email: string; password: string; options?: { data?: { full_name?: string }; emailRedirectTo?: string } }) => Promise<{ data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null }; error: { code?: string; message: string } | null }>;
  signInWithPassword: (opts: { email: string; password: string }) => Promise<{ data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null }; error: { code?: string; message: string } | null }>;
  refreshSession: (opts: { refresh_token: string }) => Promise<{ data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null }; error: { code?: string; message: string } | null }>;
};
import type {
  RegisterBody,
  LoginBody,
  RefreshBody,
  AuthSuccessResponse,
  AuthPendingConfirmationResponse,
  AuthErrorResponse,
} from "../types/auth";

const router = Router();
const DEFAULT_AUTH_REDIRECT_URL = "https://savemonei-backend.vercel.app/auth/verified";

function getAuthRedirectUrl(): string {
  return (
    process.env.AUTH_REDIRECT_URL ||
    process.env.AUTH_EMAIL_REDIRECT_TO ||
    process.env.APP_AUTH_REDIRECT_URL ||
    DEFAULT_AUTH_REDIRECT_URL
  );
}

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

function toPendingConfirmation(user: { id: string; email?: string; user_metadata?: { full_name?: string } }): AuthPendingConfirmationResponse {
  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
    },
    emailConfirmationRequired: true,
    message: "Confirm your email, then sign in to start using Savemonei.",
  };
}

function toError(code: string, message: string): AuthErrorResponse {
  return { error: { code, message } };
}

router.get("/verified", (_req: Request, res: Response) => {
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email confirmed | Savemonei</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0a0f1c;
        color: #f8fafc;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(13, 147, 115, 0.24), transparent 30%),
          #0a0f1c;
      }
      main {
        width: min(100%, 420px);
        text-align: center;
      }
      .mark {
        width: 64px;
        height: 64px;
        margin: 0 auto 20px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background: #0d9373;
        color: white;
        font-size: 32px;
        font-weight: 800;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #cbd5e1;
        font-size: 16px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">✓</div>
      <h1>Email confirmed</h1>
      <p>Your Savemonei account is ready. You can close this page and sign in from the app.</p>
    </main>
  </body>
</html>`);
});

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
      options: {
        data: { full_name: fullName },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    if (error) {
      return res.status(400).json(toError(error.code ?? "signup_failed", error.message));
    }

    if (!data.user) {
      return res.status(400).json(toError("signup_failed", "Registration failed"));
    }

    if (!data.session) {
      return res.status(202).json(toPendingConfirmation(data.user));
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
