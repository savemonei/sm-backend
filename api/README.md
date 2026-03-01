# Vercel serverless entry (single function)

Only `index.js` lives here so Vercel creates **one** serverless function (Hobby plan limit: 12). It loads the Express app from the built `src/` output (`dist/app.js`). All routes are mounted on that app in `src/app.ts`. Do not add more files under `api/` or they will each become a separate function.
