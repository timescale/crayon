// packages/cli/src/env.ts
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Walk up from startDir looking for .env file
 * Returns absolute path to .env or null if not found
 */
export function findEnvFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    dir = path.dirname(dir);
  }

  // Check root directory too
  const rootEnv = path.join(root, ".env");
  if (fs.existsSync(rootEnv)) {
    return rootEnv;
  }

  return null;
}

/**
 * Load .env file into process.env
 * Throws if DATABASE_URL is not set (required for crayon)
 */
export function loadEnv(envPath: string): void {
  const result = dotenv.config({ path: envPath, quiet: true });

  if (result.error) {
    throw new Error(`Failed to load .env: ${result.error.message}`);
  }

  // DATABASE_URL is required for crayon
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not found in .env\n" +
      "Add a PostgreSQL connection string, e.g.:\n" +
      "  DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
    );
  }
}

/**
 * Find .env starting from cwd and load it into process.env.
 * If DATABASE_URL is already set (e.g. from cloud env vars), .env is optional —
 * load it if it exists (local overrides) but don't throw if it's missing.
 */
export function resolveEnv(): void {
  const envPath = findEnvFile(process.cwd());
  if (envPath) {
    loadEnv(envPath);
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "No .env file found in current directory or parents\n" +
      "Create a .env file with at least:\n" +
      "  DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
    );
  }
}
