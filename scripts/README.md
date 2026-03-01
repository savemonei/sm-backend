# Backend API test suite

Run all backend APIs against a live server (local or deployed) before deployment.

## Setup

1. **Credentials** – Use a real test user that exists in your Supabase Auth (same project the backend uses).

2. **Config** (choose one):
   - **Env vars** when running:
     ```bash
     BASE_URL=http://localhost:4000 TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass pnpm run test:api
     ```
   - **Config file** – Copy the example and edit (do not commit real credentials):
     ```bash
     cp scripts/test-api.config.example.env scripts/test-api.config.env
     # Edit scripts/test-api.config.env: BASE_URL, TEST_EMAIL, TEST_PASSWORD
     ```
     Add `scripts/test-api.config.env` to `.gitignore` if you put real passwords there.

## Run

```bash
# From repo root (backend must be running for local tests)
pnpm run test:api
```

Or with explicit env:

```bash
BASE_URL=https://your-backend.vercel.app TEST_EMAIL=test@example.com TEST_PASSWORD=secret pnpm run test:api
```

- **Local:** Start the backend (`pnpm run dev`), then in another terminal run `pnpm run test:api` (default `BASE_URL=http://localhost:4000`).
- **Before deploy:** Set `BASE_URL` to your staging/production URL and run `pnpm run test:api`. Exit code is non-zero if any test fails.

## What is tested

| Endpoint | Auth | Expectation |
|---------|------|-------------|
| GET /health | No | 200, `{ status: "ok" }` |
| POST /auth/login | No | 200, returns session (used for remaining auth tests) |
| GET /me | Bearer | 200, `{ user }` |
| GET /profile | Bearer | 200, `{ profile }` or null |
| PUT /profile | Bearer | 200, profile updated |
| POST /auth/refresh | No (body: refresh_token) | 200, new session |
| GET /subscription-prices?region=US | No | 200 or 503 if Supabase not configured |
| GET /import/money-manager-category-map | No | 200, `{ map }` |
| POST /import/merge-categories (valid) | No | 200, `{ backupData }` |
| POST /import/merge-categories (invalid) | No | 400 |
| GET /sync/tokens | Bearer | 200 or 503 |
| PUT /sync/tokens | Bearer | 200 or 503 |
| DELETE /sync/tokens | Bearer | 200 or 503 |
| POST /ai/ask | Bearer | 200 or 503/502 if OpenAI not configured |
| POST /auth/logout | No | 200 |

Tests that require auth are **skipped** if login fails or credentials are not set. 503 responses for optional features (subscription-prices, sync, AI) are treated as **pass** so the suite can run without full Supabase/OpenAI setup.
