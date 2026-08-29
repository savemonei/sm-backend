/**
 * Copy notification config JSON into dist/data/notifications for production.
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "src", "data", "notifications");
const dest = join(__dirname, "..", "dist", "data", "notifications");

if (!existsSync(join(src, "config.json"))) {
  console.error("Notification config missing at src/data/notifications/config.json");
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Notification config copied → dist/data/notifications");
