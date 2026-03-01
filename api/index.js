/**
 * Single Vercel serverless entry – loads the Express app from the built src/ output.
 * Only this file lives in api/ so Vercel creates one function (Hobby plan limit: 12).
 */
require("dotenv").config();
module.exports = require("../dist/app").default;
