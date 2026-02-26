import { exec } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import * as dotenv from "dotenv";
import pg from "pg";
import { packageRoot, version } from "../config.js";
import { writeAppTemplates, create0pflowDirectories } from "../lib/templates.js";
import { ensureConnectionsTable } from "../../../connections/schema.js";

const execAsync = (cmd: string, cwd?: string) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr }));
      else resolve({ stdout, stderr });
    });
  });

// Monorepo root (only valid in dev mode when running from packages/core)
const monorepoRoot = join(packageRoot, "..", "..");

function isDevMode(): boolean {
  const corePath = join(monorepoRoot, "packages", "core");
  return existsSync(corePath);
}

function generatePassword(length = 24): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function buildConnectionString(
  originalUrl: string,
  user: string,
  password: string,
): string {
  const parsed = new URL(originalUrl);
  parsed.username = user;
  parsed.password = encodeURIComponent(password);
  if (!parsed.searchParams.has("uselibpqcompat")) {
    parsed.searchParams.set("uselibpqcompat", "true");
  }
  return parsed.toString();
}

// ── scaffoldApp ──────────────────────────────────────────────────────────

export interface ScaffoldAppOpts {
  appName: string;
  directory: string;
  installDeps?: boolean;
}

export interface ScaffoldAppResult {
  success: boolean;
  message: string;
  path?: string;
}

export async function scaffoldApp({
  appName,
  directory,
  installDeps = true,
}: ScaffoldAppOpts): Promise<ScaffoldAppResult> {
  const appPath = resolve(process.cwd(), directory);

  if (!existsSync(appPath)) {
    mkdirSync(appPath, { recursive: true });
  }

  try {
    await writeAppTemplates(appPath, {
      app_name: appName,
      // - Dev mode (monorepo via npm link): "dev" dist-tag
      // - Installed from 0pflow@dev (e.g. 0.1.0-dev.c6251ba): "dev" dist-tag
      // - Installed from 0pflow@latest (e.g. 0.1.0): exact version
      opflow_version: isDevMode() || version.includes("-dev.") ? "dev" : version,
    });

    await create0pflowDirectories(appPath);

    // In dev mode, link local 0pflow packages
    if (isDevMode()) {
      const corePath = join(monorepoRoot, "packages", "core");
      await execAsync("npm link", corePath);
      await execAsync("npm link 0pflow", appPath);
    }

    if (installDeps) {
      await execAsync("npm install", appPath);
    }

    // Initialize git repo with initial commit
    try {
      await execAsync("git init", appPath);
      await execAsync("git add -A", appPath);
      await execAsync('git commit -m "Initial commit"', appPath);
    } catch {
      // git not available — continue without repo
    }

    return {
      success: true,
      message: `Created 0pflow app '${appName}' in ${appPath}`,
      path: appPath,
    };
  } catch (err) {
    const error = err as Error & { stderr?: string };
    return {
      success: false,
      message: `Failed to create app: ${error.message}\n${error.stderr || ""}`,
    };
  }
}

// ── createDatabase ───────────────────────────────────────────────────────

export interface CreateDatabaseOpts {
  name?: string;
}

export interface CreateDatabaseResult {
  success: boolean;
  service_id?: string;
  error?: string;
}

export async function createDatabase({
  name,
}: CreateDatabaseOpts = {}): Promise<CreateDatabaseResult> {
  const dbName = name || "app-db";

  const cmdArgs = [
    "tiger",
    "service",
    "create",
    "--name",
    dbName,
    "--cpu",
    "shared",
    "--memory",
    "shared",
    "--addons",
    "time-series,ai",
    "--no-wait",
    "-o",
    "json",
  ];

  try {
    const { stdout, stderr } = await execAsync(cmdArgs.join(" "));
    const result = JSON.parse(stdout) as { service_id?: string };

    if (!result.service_id) {
      return {
        success: false,
        error: `No service_id in response: ${stdout}${stderr}`,
      };
    }

    return {
      success: true,
      service_id: result.service_id,
    };
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string };
    return {
      success: false,
      error: `Failed to create database: ${error.message}\n${error.stdout || ""}${error.stderr || ""}`,
    };
  }
}

// ── setupAppSchema ───────────────────────────────────────────────────────

export interface SetupAppSchemaOpts {
  directory: string;
  serviceId: string;
  appName: string;
}

export interface SetupAppSchemaResult {
  success: boolean;
  message: string;
  schema_name?: string;
  user_name?: string;
}

export async function setupAppSchema({
  directory,
  serviceId,
  appName,
}: SetupAppSchemaOpts): Promise<SetupAppSchemaResult> {
  const appDir = resolve(process.cwd(), directory);
  const envPath = join(appDir, ".env");

  // Sanitize app name into a valid PostgreSQL identifier
  // (replace hyphens/dots with underscores, strip anything else non-alphanumeric)
  const pgName = appName.replace(/[-. ]/g, "_").replace(/[^a-zA-Z0-9_]/g, "");

  // Check if already run
  if (existsSync(envPath)) {
    const envContent = await readFile(envPath, "utf-8");
    const env = dotenv.parse(envContent);
    if (env.DATABASE_SCHEMA) {
      return {
        success: true,
        message:
          "DATABASE_SCHEMA already set in .env. Delete it and re-run if you need to regenerate.",
        schema_name: pgName,
        user_name: pgName,
      };
    }
  }

  // Get database connection string from Tiger
  let adminConnectionString: string;
  try {
    const { stdout: serviceJson } = await execAsync(
      `tiger service get ${serviceId} --with-password -o json`,
    );
    const serviceDetails = JSON.parse(serviceJson) as {
      connection_string?: string;
    };

    if (!serviceDetails.connection_string) {
      return {
        success: false,
        message: "connection_string not found in service details",
      };
    }
    const parsed = new URL(serviceDetails.connection_string);
    if (!parsed.searchParams.has("uselibpqcompat")) {
      parsed.searchParams.set("uselibpqcompat", "true");
    }
    adminConnectionString = parsed.toString();
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      message: `Failed to get service details: ${error.message}`,
    };
  }

  const pool = new pg.Pool({ connectionString: adminConnectionString, max: 1 });

  try {
    const existingUser = await pool.query(
      `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`,
      [pgName],
    );

    if (existingUser.rows.length > 0) {
      return {
        success: false,
        message: `User '${pgName}' already exists. Choose a different app name or delete the existing user.`,
      };
    }

    const appPassword = generatePassword();
    await pool.query(
      `CREATE ROLE ${pgName} WITH LOGIN PASSWORD '${appPassword}'`,
    );

    await pool.query(`GRANT ${pgName} TO tsdbadmin WITH INHERIT TRUE`);

    await pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${pgName} AUTHORIZATION ${pgName}`,
    );
    await pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${pgName}_dbos AUTHORIZATION ${pgName}`,
    );

    await pool.query(
      `GRANT CREATE ON DATABASE tsdb TO ${pgName}`,
    );

    await pool.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public`,
    );

    await pool.query(`REVOKE CREATE ON SCHEMA public FROM ${pgName}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${pgName}`);

    await pool.query(
      `ALTER ROLE ${pgName} SET search_path TO ${pgName}, ${pgName}_dbos, public`,
    );

    const currentPath = await pool.query(
      `SELECT setting FROM pg_settings WHERE name = 'search_path'`,
    );
    const existingPath = currentPath.rows[0]?.setting ?? "public";
    if (!existingPath.includes(pgName)) {
      await pool.query(
        `ALTER ROLE tsdbadmin SET search_path TO ${existingPath}, ${pgName}, ${pgName}_dbos`,
      );
    }

    const existingAdmin = await pool.query(
      `SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'dbosadmin'`,
    );
    let dbosAdminPassword: string | undefined;
    if (existingAdmin.rows.length === 0) {
      dbosAdminPassword = generatePassword();
      await pool.query(
        `CREATE ROLE dbosadmin WITH LOGIN CREATEDB PASSWORD '${dbosAdminPassword}'`,
      );
    }

    const appDatabaseUrl = buildConnectionString(
      adminConnectionString,
      pgName,
      appPassword,
    );

    let envContent = "";
    if (existsSync(envPath)) {
      envContent = await readFile(envPath, "utf-8");
    }

    const env = dotenv.parse(envContent);
    env.DATABASE_URL = appDatabaseUrl;
    env.DATABASE_SCHEMA = pgName;
    if (dbosAdminPassword) {
      env.DBOS_ADMIN_URL = buildConnectionString(
        adminConnectionString,
        "dbosadmin",
        dbosAdminPassword,
      );
    }

    const newEnvContent = Object.entries(env)
      .map(([key, value]) => `${key}="${value}"`)
      .join("\n");

    await writeFile(envPath, `${newEnvContent}\n`);

    // Create the opflow_connections table so it's ready before the dev UI launches
    await ensureConnectionsTable(appDatabaseUrl, pgName);
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      message: `Failed to set up app schema: ${error.message}`,
    };
  } finally {
    await pool.end();
  }

  return {
    success: true,
    message: `Created schema '${pgName}' and user '${pgName}'. DATABASE_URL and DATABASE_SCHEMA written to .env.`,
    schema_name: pgName,
    user_name: pgName,
  };
}
