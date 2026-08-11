import { Router } from "express";
import type { Request, Response } from "../types/handlers";
import {
  authClient,
  createUserAuthClient,
  getBearerToken,
  SAFE_EMAIL_SENT,
} from "../lib/auth-client";
import type {
  RegisterBody,
  LoginBody,
  RefreshBody,
  EmailOnlyBody,
  ResetPasswordBody,
  ChangePasswordBody,
  AuthSuccessResponse,
  AuthPendingConfirmationResponse,
  AuthErrorResponse,
  AuthOkResponse,
} from "../types/auth";

const router = Router();

const DEFAULT_AUTH_CALLBACK_URL = "https://savemonei-backend.vercel.app/auth/callback";
const DEFAULT_APP_SCHEME = "savemonei";

function getAuthCallbackUrl(): string {
  return (
    process.env.AUTH_REDIRECT_URL ||
    process.env.AUTH_EMAIL_REDIRECT_TO ||
    process.env.APP_AUTH_REDIRECT_URL ||
    DEFAULT_AUTH_CALLBACK_URL
  );
}

function getAppDeepLinkBase(): string {
  const scheme = (process.env.APP_DEEP_LINK_SCHEME || DEFAULT_APP_SCHEME).replace(/:\/\/*$/, "");
  return `${scheme}://`;
}

function toAuthSuccess(
  session: { access_token: string; refresh_token: string; expires_at?: number },
  user: { id: string; email?: string; user_metadata?: { full_name?: string } }
): AuthSuccessResponse {
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

function toPendingConfirmation(user: {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string };
}): AuthPendingConfirmationResponse {
  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
    },
    emailConfirmationRequired: true,
    message: "Please check your inbox and confirm your email before signing in.",
  };
}

function toError(code: string, message: string): AuthErrorResponse {
  return { error: { code, message } };
}

function toOk(message: string): AuthOkResponse {
  return { success: true, message };
}

function mapAuthErrorMessage(code: string | undefined, fallback: string): string {
  const c = (code || "").toLowerCase();
  if (c === "email_not_confirmed" || c.includes("not_confirmed")) {
    return "Please verify your email before signing in.";
  }
  if (c === "invalid_credentials" || c === "invalid_grant") {
    return "Invalid email or password.";
  }
  if (c === "user_already_exists" || c === "email_exists") {
    return "Unable to create account with that email. Try signing in or reset your password.";
  }
  if (c === "over_email_send_rate_limit" || c === "over_request_rate_limit") {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (c === "weak_password") {
    return "Please choose a stronger password.";
  }
  return fallback;
}

/**
 * GET /auth/callback
 * Bridge page: Supabase redirects here with tokens in the URL hash/query.
 * Forwards recovery/signup sessions into the app via savemonei://auth/callback.
 */
router.get("/callback", (_req: Request, res: Response) => {
  const deepLinkBase = getAppDeepLinkBase();
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Continue in Savemonei</title>
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
      main { width: min(100%, 420px); text-align: center; }
      .mark {
        width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 18px;
        display: grid; place-items: center; background: #0d9373; color: white;
        font-size: 32px; font-weight: 800;
      }
      h1 { margin: 0 0 10px; font-size: 26px; line-height: 1.2; }
      p { margin: 0 0 16px; color: #cbd5e1; font-size: 16px; line-height: 1.6; }
      a.btn {
        display: inline-block; margin-top: 8px; padding: 12px 20px; border-radius: 10px;
        background: #0d9373; color: #fff; text-decoration: none; font-weight: 600;
      }
      .muted { color: #94a3b8; font-size: 13px; margin-top: 18px; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">✓</div>
      <h1 id="title">Opening Savemonei…</h1>
      <p id="message">If the app does not open automatically, tap the button below.</p>
      <a class="btn" id="open" href="${deepLinkBase}">Open Savemonei</a>
      <p class="muted" id="hint">You can close this page after the app opens.</p>
    </main>
    <script>
      (function () {
        var deepLinkBase = ${JSON.stringify(deepLinkBase)};
        var params = new URLSearchParams(window.location.search || "");
        var hash = (window.location.hash || "").replace(/^#/, "");
        if (hash) {
          var hashParams = new URLSearchParams(hash);
          hashParams.forEach(function (value, key) {
            if (!params.has(key)) params.set(key, value);
          });
        }

        var type = params.get("type") || "";
        var accessToken = params.get("access_token") || "";
        var refreshToken = params.get("refresh_token") || "";
        var error = params.get("error") || params.get("error_code") || "";
        var errorDescription = params.get("error_description") || "";

        var titleEl = document.getElementById("title");
        var messageEl = document.getElementById("message");
        var openEl = document.getElementById("open");

        if (error) {
          titleEl.textContent = "Link expired or invalid";
          messageEl.textContent = errorDescription
            ? decodeURIComponent(errorDescription.replace(/\\+/g, " "))
            : "That link is no longer valid. Request a new one from the app.";
          openEl.href = deepLinkBase + "auth/login";
          openEl.textContent = "Back to sign in";
          return;
        }

        var target = deepLinkBase + "auth/callback";
        var out = new URLSearchParams();
        if (type) out.set("type", type);
        if (accessToken) out.set("access_token", accessToken);
        if (refreshToken) out.set("refresh_token", refreshToken);
        var qs = out.toString();
        if (qs) target += "?" + qs;

        if (type === "recovery") {
          titleEl.textContent = "Reset your password";
          messageEl.textContent = "Continue in the Savemonei app to choose a new password.";
        } else if (type === "signup" || type === "email" || type === "email_change") {
          titleEl.textContent = "Email confirmed";
          messageEl.textContent = accessToken
            ? "Your email is confirmed. Opening the app…"
            : "Your email is confirmed. Open the app and sign in.";
        }

        openEl.href = target;
        window.location.replace(target);
      })();
    </script>
  </body>
</html>`);
});

/** Legacy email-confirmed landing (kept for older emails already sent). */
router.get("/verified", (_req: Request, res: Response) => {
  const deepLinkBase = getAppDeepLinkBase();
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
        min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px;
        background: radial-gradient(circle at top left, rgba(13, 147, 115, 0.24), transparent 30%), #0a0f1c;
      }
      main { width: min(100%, 420px); text-align: center; }
      .mark {
        width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 18px;
        display: grid; place-items: center; background: #0d9373; color: white;
        font-size: 32px; font-weight: 800;
      }
      h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.2; }
      p { margin: 0 0 16px; color: #cbd5e1; font-size: 16px; line-height: 1.6; }
      a.btn {
        display: inline-block; padding: 12px 20px; border-radius: 10px;
        background: #0d9373; color: #fff; text-decoration: none; font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">✓</div>
      <h1>Email confirmed</h1>
      <p>Your Savemonei account is ready. Open the app and sign in.</p>
      <a class="btn" href="${deepLinkBase}auth/login">Open Savemonei</a>
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
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });

    if (error) {
      return res
        .status(400)
        .json(
          toError(
            error.code ?? "signup_failed",
            mapAuthErrorMessage(error.code, "Unable to create account. Please try again.")
          )
        );
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
      return res.status(401).json(
        toError(
          error.code ?? "login_failed",
          mapAuthErrorMessage(error.code, "Invalid email or password.")
        )
      );
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
      return res.status(401).json(toError(error.code ?? "refresh_failed", "Session expired. Please sign in again."));
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
 * POST /auth/resend-confirmation
 * Body: { email }
 * Always returns a generic success message to avoid account enumeration.
 */
router.post("/resend-confirmation", async (req: Request, res: Response) => {
  try {
    const { email } = req.body as EmailOnlyBody;
    if (!email || typeof email !== "string") {
      return res.status(400).json(toError("invalid_body", "email is required"));
    }

    const { error } = await authClient.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: getAuthCallbackUrl() },
    });

    if (error) {
      const code = (error.code || "").toLowerCase();
      if (code.includes("rate") || /rate|seconds/i.test(error.message || "")) {
        return res.status(429).json(
          toError("rate_limited", "You can request another confirmation email in 30 seconds.")
        );
      }
      // Still return generic success for most errors (e.g. already confirmed / unknown email)
      console.warn("[auth] resend-confirmation:", error.code, error.message);
    }

    return res.status(200).json(toOk(SAFE_EMAIL_SENT));
  } catch (e) {
    console.error("Auth resend-confirmation error:", e);
    return res.status(500).json(toError("server_error", "Something went wrong. Please try again."));
  }
});

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Always returns a generic success message to avoid account enumeration.
 */
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body as EmailOnlyBody;
    if (!email || typeof email !== "string") {
      return res.status(400).json(toError("invalid_body", "email is required"));
    }

    const { error } = await authClient.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthCallbackUrl(),
    });

    if (error) {
      const code = (error.code || "").toLowerCase();
      if (code.includes("rate") || /rate|seconds/i.test(error.message || "")) {
        return res.status(429).json(
          toError("rate_limited", "Too many attempts. Please wait a moment and try again.")
        );
      }
      console.warn("[auth] forgot-password:", error.code, error.message);
    }

    return res.status(200).json(toOk(SAFE_EMAIL_SENT));
  } catch (e) {
    console.error("Auth forgot-password error:", e);
    return res.status(500).json(toError("server_error", "Something went wrong. Please try again."));
  }
});

/**
 * POST /auth/reset-password
 * Authorization: Bearer <recovery access token>
 * Body: { password }
 */
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const accessToken = getBearerToken(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json(toError("unauthorized", "That reset link has expired. Request a new one."));
    }

    const { password } = req.body as ResetPasswordBody;
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json(toError("invalid_body", "Password must be at least 6 characters."));
    }

    const userClient = createUserAuthClient(accessToken);
    const { data, error } = await userClient.auth.updateUser({ password });

    if (error) {
      const code = (error.code || "").toLowerCase();
      if (code.includes("session") || code.includes("jwt") || /expired|invalid/i.test(error.message || "")) {
        return res.status(401).json(toError("expired_link", "That reset link has expired. Request a new one."));
      }
      return res.status(400).json(
        toError(error.code ?? "reset_failed", mapAuthErrorMessage(error.code, "Unable to update password. Please try again."))
      );
    }

    if (!data.user) {
      return res.status(400).json(toError("reset_failed", "Unable to update password. Please try again."));
    }

    // Best-effort sign-out so recovery session is not left active
    try {
      await userClient.auth.signOut();
    } catch {
      // ignore
    }

    return res.status(200).json(toOk("Password updated. You can sign in with your new password."));
  } catch (e) {
    console.error("Auth reset-password error:", e);
    return res.status(500).json(toError("server_error", "Something went wrong. Please try again."));
  }
});

/**
 * POST /auth/change-password
 * Authorization: Bearer <access token>
 * Body: { currentPassword, newPassword }
 */
router.post("/change-password", async (req: Request, res: Response) => {
  try {
    const accessToken = getBearerToken(req.headers.authorization);
    if (!accessToken) {
      return res.status(401).json(toError("unauthorized", "Please sign in again."));
    }

    const { currentPassword, newPassword } = req.body as ChangePasswordBody;
    if (!currentPassword || !newPassword) {
      return res.status(400).json(toError("invalid_body", "currentPassword and newPassword are required"));
    }
    if (newPassword.length < 6) {
      return res.status(400).json(toError("invalid_body", "Password must be at least 6 characters."));
    }
    if (currentPassword === newPassword) {
      return res.status(400).json(toError("same_password", "New password must be different from your current password."));
    }

    const userClient = createUserAuthClient(accessToken);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user?.email) {
      return res.status(401).json(toError("unauthorized", "Please sign in again."));
    }

    const email = userData.user.email;
    const { error: verifyError } = await authClient.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) {
      return res.status(401).json(toError("invalid_credentials", "Current password is incorrect."));
    }

    const { error: updateError } = await userClient.auth.updateUser({ password: newPassword });
    if (updateError) {
      return res.status(400).json(
        toError(
          updateError.code ?? "change_failed",
          mapAuthErrorMessage(updateError.code, "Unable to change password. Please try again.")
        )
      );
    }

    return res.status(200).json(toOk("Password updated successfully."));
  } catch (e) {
    console.error("Auth change-password error:", e);
    return res.status(500).json(toError("server_error", "Something went wrong. Please try again."));
  }
});

/**
 * POST /auth/logout
 * Authorization: Bearer <access token> (optional)
 * Revokes the server session when a token is provided.
 */
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const accessToken = getBearerToken(req.headers.authorization);
    if (accessToken) {
      try {
        const userClient = createUserAuthClient(accessToken);
        await userClient.auth.signOut();
      } catch (e) {
        console.warn("[auth] logout revoke failed:", e);
      }
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("Auth logout error:", e);
    return res.status(200).json({ success: true });
  }
});

export default router;
