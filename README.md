
# Savemonei Backend

Backend API for Savemonei: auth (via Supabase), AI, and sync. App talks only to this backend; backend talks to Supabase for auth.

## Setup

1. Copy `.env.example` to `.env` and set:
   - `SUPABASE_URL` – your Supabase project URL
   - `SUPABASE_ANON_KEY` – your Supabase anon (public) key
   - `PORT` (optional, default 4000)

2. Install and run:

```bash
# With pnpm (recommended)
pnpm install
pnpm run dev

# Or npm
npm install
npm run dev
```

## Auth API (v1)

Base URL: `http://localhost:4000` (or your `PORT`).

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | `{ email, password, fullName }` | Register; returns `{ user, session }` with `access_token`, `refresh_token`, `expires_in`. |
| POST | `/auth/login` | `{ email, password }` | Login; same response shape. |
| POST | `/auth/refresh` | `{ refresh_token }` | New access + refresh tokens. |
| POST | `/auth/logout` | (optional) | 200 OK; client discards tokens. |

**Protected routes:** send `Authorization: Bearer <access_token>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Current user (requires valid token). |

**Response shape (success):**

```json
{
  "user": { "id": "...", "email": "...", "full_name": "..." },
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}
```

**Error shape:** `{ "error": { "code": "...", "message": "..." } }`

## Scripts

- `pnpm run dev` – run with ts-node-dev (watch)
- `pnpm run build` – compile to `dist/`
- `pnpm start` – run compiled `dist/index.js`

## Deploy on Vercel

1. **Install pnpm** (if needed): `corepack enable && corepack prepare pnpm@latest --activate`
2. **Lockfile**: Run `pnpm install` so `pnpm-lock.yaml` and `@types/express-serve-static-core` are up to date (needed for build).
3. **Connect repo** to Vercel; root directory = this project.
4. **Environment variables** in Vercel: set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
5. **Deploy**: Vercel runs `pnpm install`, then `pnpm run build` (from `vercel.json`), then deploys the serverless function from `api/index.ts`.

After deploy, API base URL is `https://<your-project>.vercel.app` (e.g. `GET .../health`, `POST .../auth/login`).
