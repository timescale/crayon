import { existsSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

/**
 * Load .env directly from cwd — NOT via resolveEnv() which walks up
 * the directory tree and may find a parent .env instead of the app's.
 * Uses override: true so the app's values always win.
 */
function loadProjectEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true, quiet: true });
  }
}

/**
 * Load .env from cwd and return DATABASE_URL.
 * Throws with a helpful message if not found.
 */
export function requireDatabaseUrl(): string {
  loadProjectEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set in .env");
  return url;
}

// Re-export parseOutput for MCP tools to unwrap superjson DB rows
export { parseOutput } from "../../trace.js";
