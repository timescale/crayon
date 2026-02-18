import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import * as dotenv from "dotenv";
import { apiCall } from "../connections/cloud-client.js";
import { isAuthenticated, authenticate, AuthRequiredError } from "../connections/cloud-auth.js";

export type DeployStep =
  | "preflight"
  | "authenticating"
  | "preparing"
  | "packaging"
  | "uploading"
  | "polling"
  | "done"
  | "error";

export interface DeployProgress {
  step: DeployStep;
  message?: string;
  url?: string;
}

export interface DeployOptions {
  verbose?: boolean;
  /** Progress callback for programmatic use (Dev UI SSE). */
  onProgress?: (progress: DeployProgress) => void;
}

export interface DeployResult {
  success: boolean;
  url?: string;
  version?: string;
  error?: string;
}

/**
 * Core deploy logic — usable by both CLI and Dev UI server.
 */
export async function deploy(
  projectDir: string,
  options: DeployOptions = {},
): Promise<DeployResult> {
  const progress = options.onProgress ?? (() => { });

  // ── Step 1: Pre-flight checks ──────────────────────────────────
  progress({ step: "preflight", message: "Running pre-flight checks..." });

  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    return { success: false, error: "No package.json found. Run from a 0pflow app directory." };
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    name?: string;
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies?.["0pflow"]) {
    return { success: false, error: "Not a 0pflow app (0pflow not in dependencies)." };
  }
  if (!pkg.name) {
    return { success: false, error: "package.json is missing a name field." };
  }

  const envPath = join(projectDir, ".env");
  if (!existsSync(envPath)) {
    return { success: false, error: ".env file not found. Run setup first." };
  }
  const env = dotenv.parse(readFileSync(envPath, "utf-8"));
  if (!env.DATABASE_URL) {
    return { success: false, error: "DATABASE_URL not found in .env." };
  }

  const appName = pkg.name;

  // ── Step 2: Authenticate ───────────────────────────────────────
  progress({ step: "authenticating", message: "Checking authentication..." });

  if (!isAuthenticated()) {
    await authenticate();
    if (!isAuthenticated()) {
      return { success: false, error: "Not authenticated. Run `0pflow login` first." };
    }
  }

  // ── Step 3: Prepare via auth-server ────────────────────────────
  progress({ step: "preparing", message: "Preparing deployment..." });

  const dbUrl = new URL(env.DATABASE_URL);
  const dbHostname = dbUrl.hostname;
  const dbPort = parseInt(dbUrl.port || "5432", 10);

  // DBOS_ADMIN_URL provides the dbosadmin role credentials for BYOD linking
  if (!env.DBOS_ADMIN_URL) {
    return {
      success: false,
      error: "DBOS_ADMIN_URL not found in .env. You need to create the dbosadmin user and add the DBOS_ADMIN_URL.",
    };
  }
  const adminUrl = new URL(env.DBOS_ADMIN_URL);
  const dbPassword = decodeURIComponent(adminUrl.password);

  // Filter env vars
  const envVarsToSync: Record<string, string> = {};
  const skipKeys = new Set([
    "DBOS_ADMIN_URL",
    "DBOS_SYSTEM_DATABASE_URL",
    "DBOS_CONDUCTOR_KEY",
  ]);
  for (const [key, value] of Object.entries(env)) {
    if (!skipKeys.has(key)) {
      envVarsToSync[key] = value;
    }
  }

  // Include OPFLOW_TOKEN for runtime integration credential fetching
  const { getToken } = await import("../connections/cloud-auth.js");
  const opflowToken = getToken();
  if (opflowToken) {
    envVarsToSync.OPFLOW_TOKEN = opflowToken;
  }

  let dbosAppName: string;

  try {
    const result = (await apiCall("POST", "/api/deploy/prepare", {
      appName,
      databaseHostname: dbHostname,
      databasePort: dbPort,
      databasePassword: dbPassword,
      envVars: envVarsToSync,
    })) as { dbosAppName: string };

    dbosAppName = result.dbosAppName;
  } catch (err) {
    return {
      success: false,
      error: `Prepare failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 4: Package app as ZIP ─────────────────────────────────
  progress({ step: "packaging", message: "Packaging application..." });

  let archive: string;
  try {
    archive = await createDeploymentZip(projectDir, dbosAppName);
  } catch (err) {
    return {
      success: false,
      error: `Packaging failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 5: Upload via auth-server ─────────────────────────────
  progress({ step: "uploading", message: "Uploading..." });

  let version: string;
  try {
    const result = (await apiCall("POST", "/api/deploy/upload", {
      appName,
      archive,
    })) as { version: string };

    version = result.version;
  } catch (err) {
    return {
      success: false,
      error: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 6: Poll for availability ──────────────────────────────
  progress({ step: "polling", message: "Waiting for app to become available..." });

  const pollStart = Date.now();
  const pollTimeout = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - pollStart < pollTimeout) {
    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const status = (await apiCall(
        "GET",
        `/api/deploy/status?appName=${encodeURIComponent(appName)}`,
      )) as { status: string; appUrl?: string };

      if (status.status === "AVAILABLE") {
        progress({ step: "done", url: status.appUrl ?? undefined });
        return {
          success: true,
          url: status.appUrl ?? undefined,
          version,
        };
      }

      if (status.status === "ERROR" || status.status === "UNAVAILABLE") {
        return {
          success: false,
          error: `App status: ${status.status}. Check logs with: 0pflow deploy --logs`,
        };
      }
    } catch {
      // Continue polling on transient errors
    }
  }

  return {
    success: false,
    error: "Timed out waiting for app to become available.",
  };
}

/**
 * CLI entry point for `0pflow deploy`.
 */
export async function runDeploy(options: { verbose?: boolean } = {}): Promise<void> {
  p.intro(pc.bold("0pflow deploy"));

  const s = p.spinner();
  let currentStep = "";

  const result = await deploy(process.cwd(), {
    verbose: options.verbose,
    onProgress: (prog) => {
      if (prog.step === "done") {
        s.stop(pc.green("App is available!"));
        return;
      }
      if (prog.step === "error") {
        s.stop(pc.red(prog.message ?? "Error"));
        return;
      }
      if (prog.message && prog.step !== currentStep) {
        if (currentStep) {
          s.stop(pc.green("Done"));
        }
        currentStep = prog.step;
        s.start(prog.message);
      }
    },
  });

  if (result.success) {
    if (result.url) {
      p.log.info(`URL: ${pc.cyan(result.url)}`);
    }
    if (result.version) {
      p.log.info(`Version: ${result.version}`);
    }
    p.outro(pc.green("Deploy complete!"));
  } else {
    p.log.error(result.error ?? "Deploy failed");
    p.outro(pc.red("Deploy failed"));
    process.exit(1);
  }
}

// ── ZIP Packaging ────────────────────────────────────────────────

/**
 * Files and directories to exclude from the deployment ZIP.
 */
const EXCLUDE_PATTERNS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".dbos",
  ".next",
  "venv",
  ".venv",
  ".python-version",
  "dbos-config.yaml",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  ".env",
  ".env.local",
]);

/**
 * Parse .dbosignore file and return a set of relative paths to exclude.
 */
function parseDbosIgnore(projectDir: string): Set<string> {
  const ignorePath = join(projectDir, ".dbosignore");
  if (!existsSync(ignorePath)) return new Set();

  const lines = readFileSync(ignorePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  return new Set(lines);
}

/**
 * Recursively collect files for the ZIP, respecting exclusions.
 */
function collectFiles(
  dir: string,
  baseDir: string,
  excludeNames: Set<string>,
  dbosIgnore: Set<string>,
): Array<{ relativePath: string; absolutePath: string }> {
  const results: Array<{ relativePath: string; absolutePath: string }> = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (excludeNames.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath);

    // Check .dbosignore patterns
    if (dbosIgnore.has(relPath) || dbosIgnore.has(entry.name)) continue;

    if (entry.isDirectory()) {
      results.push(
        ...collectFiles(fullPath, baseDir, excludeNames, dbosIgnore),
      );
    } else if (entry.isFile()) {
      results.push({ relativePath: relPath, absolutePath: fullPath });
    }
  }

  return results;
}

/**
 * Create a deployment ZIP as a base64 string.
 * Generates dbos-config.yaml in the ZIP with the correct namespaced app name.
 */
async function createDeploymentZip(
  projectDir: string,
  dbosAppName: string,
): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const dbosIgnore = parseDbosIgnore(projectDir);
  const files = collectFiles(projectDir, projectDir, EXCLUDE_PATTERNS, dbosIgnore);

  for (const file of files) {
    const data = readFileSync(file.absolutePath);
    const mode = statSync(file.absolutePath).mode;
    zip.file(file.relativePath.replace(/\\/g, "/"), data, {
      binary: true,
      unixPermissions: mode,
    });
  }

  // Generate dbos-config.yaml with the namespaced app name
  // system_database_url points to existing tsdb (Tiger Cloud doesn't allow creating new databases)
  const dbosConfig = [
    `name: ${dbosAppName}`,
    `language: node`,
    `system_database_url: \${DBOS_SYSTEM_DATABASE_URL}`,
    `runtimeConfig:`,
    `  start:`,
    `    - npm run start`,
  ].join("\n");

  zip.file("dbos-config.yaml", dbosConfig);

  const buffer = await zip.generateAsync({
    platform: "UNIX",
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buffer.toString("base64");
}
