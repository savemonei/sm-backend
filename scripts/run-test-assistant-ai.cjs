/**
 * Resolve nested ts-node (via ts-node-dev) then run schema unit checks.
 */
const { createRequire } = require("module");
const path = require("path");

const fromTsNodeDev = createRequire(
  require.resolve("ts-node-dev/package.json")
);
require(fromTsNodeDev.resolve("ts-node/register/transpile-only"));
require(path.join(__dirname, "test-assistant-ai.ts"));
