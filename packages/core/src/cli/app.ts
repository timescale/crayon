// packages/cli/src/app.ts
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

/**
 * Get the app name from package.json in cwd
 * Returns undefined if not found
 */
export function getAppName(): string | undefined {
  const pkgPath = path.join(process.cwd(), "package.json");

  if (!fs.existsSync(pkgPath)) {
    return undefined;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.name;
  } catch {
    return undefined;
  }
}

/**
 * Get the app schema name from DATABASE_SCHEMA in the project's .env file.
 * This is the canonical source — written by setup_app_schema.
 * @param projectRoot Directory containing the .env file (defaults to cwd)
 */
export function getAppSchema(projectRoot?: string): string {
  // Check process.env first (e.g. Fly secrets in cloud-dev)
  if (process.env.DATABASE_SCHEMA) {
    return process.env.DATABASE_SCHEMA;
  }

  const envPath = path.join(projectRoot ?? process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    throw new Error(
      "DATABASE_SCHEMA not found in .env file. " +
      "Run setup_app_schema to configure the database.",
    );
  }

  try {
    const env = dotenv.parse(fs.readFileSync(envPath, "utf-8"));
    if (!env.DATABASE_SCHEMA) {
      throw new Error(
        "DATABASE_SCHEMA not found in .env file. " +
        "Run setup_app_schema to configure the database.",
      );
    }
    return env.DATABASE_SCHEMA;
  } catch (err) {
    if (err instanceof Error && err.message.includes("DATABASE_SCHEMA")) throw err;
    throw new Error(
      "DATABASE_SCHEMA not found in .env file. " +
      "Run setup_app_schema to configure the database.",
    );
  }
}
