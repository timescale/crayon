import { exec, execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";
import * as dotenv from "dotenv";
import {
  scaffoldApp,
  createDatabase,
  setupAppSchema,
} from "./mcp/lib/scaffolding.js";

function isClaudeAvailable(): boolean {
  try {
    execSync("claude --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll Tiger Cloud until the service is ready (status == "ready").
 * Returns true if ready, false on timeout.
 * Throws an error if the service is not found or tiger CLI is unavailable.
 */
async function waitForDatabase(
  serviceId: string,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 5000,
): Promise<boolean> {
  const start = Date.now();
  const { execSync } = await import("node:child_process");

  while (Date.now() - start < timeoutMs) {
    try {
      const stdout = execSync(`tiger service get ${serviceId} -o json`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const info = JSON.parse(stdout) as { status?: string };
      // Only return true when database is actually ready
      if (info.status?.toLowerCase() === "ready") {
        return true;
      }
    } catch (error) {
      const err = error as Error & { stderr?: string };
      // Check if it's a "service not found" or "tiger CLI not available" error
      if (err.message?.includes("not found") || err.stderr?.includes("not found")) {
        throw new Error(`Service ${serviceId} not found. Please check the service ID.`);
      }
      if (err.message?.includes("command not found") || err.message?.includes("tiger")) {
        throw new Error("Tiger CLI not available. Please install it from https://tiger.tigerdata.cloud");
      }
      // For other errors (network, etc.), continue retrying
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Extract the service ID from a Tiger Cloud DATABASE_URL.
 * Tiger Cloud hostnames follow the pattern: <service_id>.<region>.aws.tsdb.cloud
 */
function extractServiceIdFromUrl(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl);
    const hostname = url.hostname;

    // Match Tiger Cloud hostname patterns like: abc123def4.us-east-1.aws.tsdb.cloud
    const match = hostname.match(/^([a-z0-9]{10})\./);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check database status and start it if paused/stopped.
 * Returns the status: "started", "already_running", "not_found", or "creating"
 */
function startDatabaseIfNeeded(serviceId: string, noWait = false): string {
  try {
    const stdout = execSync(`tiger service get ${serviceId} -o json`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const info = JSON.parse(stdout) as { status?: string };

    if (!info.status) {
      return "not_found";
    }

    const status = info.status.toLowerCase();

    // If database is paused or stopped, start it
    if (status === "paused" || status === "stopped") {
      execSync(`tiger service start ${serviceId}${noWait ? " --no-wait" : ""}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return "started";
    }

    if (status === "creating") {
      return "creating";
    }

    // Already running
    return "already_running";
  } catch {
    // tiger CLI not available or service not found
    return "not_found";
  }
}

/**
 * Check if Tiger CLI is installed and authenticated.
 * If not authenticated, triggers interactive login (opens browser).
 */
function ensureTigerAuth(): void {
  // Check if tiger CLI is available
  try {
    execSync("tiger version", { stdio: "ignore" });
  } catch {
    p.log.error("Tiger CLI not found. Install it: curl -fsSL https://cli.tigerdata.com | sh");
    process.exit(1);
  }

  // Check if authenticated
  try {
    const stdout = execSync("tiger auth status -o json", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    JSON.parse(stdout); // Will throw if not valid JSON (not authenticated)
  } catch {
    p.log.info("Tiger Cloud authentication required. Opening browser...");
    try {
      execSync("tiger auth login", { stdio: "inherit" });
    } catch {
      p.log.error("Tiger Cloud login failed. Try running 'tiger auth login' manually.");
      process.exit(1);
    }
  }
}

function isExistingcrayon(): boolean {
  try {
    const cwd = process.cwd();
    // Monorepo root has pnpm-workspace.yaml — not a user app
    if (existsSync(join(cwd, "pnpm-workspace.yaml"))) return false;
    const pkgPath = join(cwd, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return "crayon" in deps || "runcrayon" in deps;
  } catch {
    return false;
  }
}

interface ProjectInfo {
  name: string;
  path: string;
}

/**
 * Scan ~/crayon/ for directories that contain a package.json with crayon as a dependency.
 */
function discoverProjects(): ProjectInfo[] {
  const baseDir = join(homedir(), "crayon");
  if (!existsSync(baseDir)) return [];

  const projects: ProjectInfo[] = [];
  let entries: string[];
  try {
    entries = readdirSync(baseDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const projectDir = join(baseDir, entry);
    const pkgPath = join(projectDir, "package.json");
    try {
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ("crayon" in deps || "runcrayon" in deps) {
        projects.push({ name: entry, path: projectDir });
      }
    } catch {
      continue;
    }
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

/**
 * Resolve the auth-server directory relative to this file's location in the monorepo.
 * Returns null if not in the monorepo (e.g., published npm package).
 */
function getAuthServerDir(): string | null {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(__dirname, "../../../auth-server");
  return existsSync(join(candidate, "package.json")) ? candidate : null;
}

/**
 * Start the auth-server as a local Next.js dev process.
 * Sets CRAYON_SERVER_URL and CRAYON_TOKEN in process.env.
 * Registers cleanup handlers to kill the child on exit.
 */
async function startLocalAuthServer(): Promise<void> {
  const authServerDir = getAuthServerDir();
  if (!authServerDir) {
    throw new Error("Auth-server not found. This command is only available in the crayon monorepo.");
  }
  if (!existsSync(join(authServerDir, ".env.local"))) {
    throw new Error(`auth-server/.env.local not found. Create it first — see packages/auth-server/README.md`);
  }

  const { getToken } = await import("../connections/cloud-auth.js");
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated with crayon cloud. Run `crayon login` first.");
  }

  p.log.info("Starting local auth-server on port 3000...");

  const child = spawn("npx", ["next", "dev", "--port", "3000"], {
    cwd: authServerDir,
    stdio: "pipe",
    env: { ...process.env },
  });

  // Log auth-server errors to stderr
  child.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) process.stderr.write(`[auth-server] ${msg}\n`);
  });

  // Cleanup on exit
  const cleanup = () => { try { child.kill("SIGTERM"); } catch {} };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  // Wait for health
  const timeout = 30_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch("http://localhost:3000");
      if (res.ok || res.status < 500) break;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (Date.now() - start >= timeout) {
    cleanup();
    throw new Error("Auth-server failed to start within 30 seconds");
  }

  p.log.success("Auth-server ready at http://localhost:3000");

  process.env.CRAYON_SERVER_URL = "http://localhost:3000";
  process.env.CRAYON_TOKEN = token;
}

async function launchExistingProject(projectPath: string, opts?: { withAuthServer?: boolean }): Promise<void> {
  // Check if database is paused and start it if needed
  try {
    const { findEnvFile } = await import("./env.js");
    const envPath = findEnvFile(projectPath);
    if (envPath) {
      const envContent = readFileSync(envPath, "utf-8");
      const parsed = dotenv.parse(envContent);

      if (parsed.DATABASE_URL) {
        const serviceId = extractServiceIdFromUrl(parsed.DATABASE_URL);
        if (serviceId) {
          const status = startDatabaseIfNeeded(serviceId, false);
          if (status === "started") {
            const s = p.spinner();
            s.start("Database was paused, waiting for it to start...");
            const ready = await waitForDatabase(serviceId, 3 * 60 * 1000);
            if (ready) {
              s.stop(pc.green("Database is ready"));
            } else {
              s.stop(pc.yellow("Database is starting (taking longer than expected)"));
            }
          }
        }
      }
    }
  } catch {
    // Continue without database check if env loading fails
  }

  const mode = await p.select({
    message: "Launch mode",
    options: [
      { value: "normal" as const, label: "Launch" },
      { value: "yolo" as const, label: "Launch with --dangerously-skip-permissions" },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  p.outro(pc.green("Launching..."));
  await launchDevServer(projectPath, { yolo: mode === "yolo", withAuthServer: opts?.withAuthServer });
}

async function launchDevServer(cwd: string, { yolo = false, withAuthServer = false }: { yolo?: boolean; withAuthServer?: boolean } = {}): Promise<void> {
  // Load .env from the app directory (not process.cwd(), which may be a parent)
  try {
    const { findEnvFile, loadEnv } = await import("./env.js");
    const envPath = findEnvFile(cwd);
    if (envPath) loadEnv(envPath);
  } catch {
    // Dev UI can work without env
  }

  if (withAuthServer) {
    await startLocalAuthServer();
  }

  const { startDevServer } = await import("../dev-ui/index.js");
  const { url } = await startDevServer({
    projectRoot: cwd,
    databaseUrl: process.env.DATABASE_URL,
    nangoSecretKey: process.env.NANGO_SECRET_KEY,
    claudeSkipPermissions: yolo,
  });

  // Open dev UI in browser
  try {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {
    // Non-fatal — user can open manually
  }

  // Launch Claude — MCP server was registered during scaffolding
  const claude = spawn("claude", [
    ...(yolo ? ["--dangerously-skip-permissions"] : []),
  ], { stdio: "inherit", cwd });
  claude.on("exit", (code) => process.exit(code ?? 0));
}

export async function runRun(opts?: { withAuthServer?: boolean }): Promise<void> {
  p.intro(pc.red("crayon"));

  if (!isClaudeAvailable()) {
    p.log.error("Claude Code CLI not found. Install it from https://claude.ai/code");
    process.exit(1);
  }

  // ── Existing project (CWD) → launch directly ───────────────────────
  if (isExistingcrayon()) {
    await launchExistingProject(process.cwd(), opts);
    return;
  }

  // ── Discover existing projects in ~/crayon/ ───────────────────────
  const projects = discoverProjects();

  if (projects.length > 0) {
    const CREATE_NEW = "__create_new__";

    const projectChoice = await p.select({
      message: "Select a project",
      options: [
        ...projects.map((proj) => ({
          value: proj.path,
          label: proj.name,
          hint: proj.path,
        })),
        {
          value: CREATE_NEW,
          label: pc.green("+ Create new project"),
        },
      ],
    });

    if (p.isCancel(projectChoice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (projectChoice !== CREATE_NEW) {
      await launchExistingProject(projectChoice, opts);
      return;
    }
  }

  // ── Project name ────────────────────────────────────────────────────
  const projectName = await p.text({
    message: "Project name",
    placeholder: "my-app",
    validate(value) {
      if (!value) return "Project name is required";
      if (!/^[a-z][a-z0-9-]*$/.test(value)) {
        return "Must be lowercase letters, numbers, and hyphens (start with a letter)";
      }
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // ── Directory (always ~/crayon/<name>) ────────────────────────────
  const directory = join(homedir(), "crayon", projectName);

  // ── Tiger auth ────────────────────────────────────────────────────
  ensureTigerAuth();

  // ── Database ────────────────────────────────────────────────────────
  const dbChoice = await p.select({
    message: "Database setup",
    options: [
      {
        value: "new" as const,
        label: "Create new Tiger Cloud database (free)",
      },
      {
        value: "existing" as const,
        label: "Use existing Tiger Cloud database",
      },
    ],
  });

  if (p.isCancel(dbChoice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  let serviceId: string | undefined;

  if (dbChoice === "existing") {
    // Fetch available databases from Tiger Cloud
    let services: { service_id: string; name: string; status: string }[] = [];
    try {
      const stdout = execSync("tiger service list -o json", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      services = JSON.parse(stdout) as typeof services;
    } catch {
      // tiger CLI not available or not logged in
    }

    if (services.length > 0) {
      const selected = await p.select({
        message: "Select a database",
        options: [
          ...services.map((s) => ({
            value: s.service_id,
            label: `${s.name} (${s.service_id})`,
            hint: s.status,
          })),
          { value: "__manual__" as string, label: "Enter service ID manually" },
        ],
      });

      if (p.isCancel(selected)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }

      if (selected === "__manual__") {
        const sid = await p.text({
          message: "Tiger Cloud service ID",
          placeholder: "abc123def4",
          validate(value) {
            if (!value) return "Service ID is required";
          },
        });
        if (p.isCancel(sid)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        serviceId = sid;
      } else {
        serviceId = selected;
      }
    } else {
      p.log.warn("Could not fetch databases. Enter the service ID manually.");
      const sid = await p.text({
        message: "Tiger Cloud service ID",
        placeholder: "abc123def4",
        validate(value) {
          if (!value) return "Service ID is required";
        },
      });
      if (p.isCancel(sid)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      serviceId = sid;
    }

    // Start database if paused (async, don't wait)
    if (serviceId) {
      const status = startDatabaseIfNeeded(serviceId, true);
      if (status === "started") {
        p.log.info("Database was paused, starting it in the background...");
      }
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────
  const s = p.spinner();

  // Create database if needed (returns immediately with --no-wait)
  if (dbChoice === "new") {
    s.start("Creating Tiger Cloud database...");
    const dbResult = await createDatabase({ name: projectName });
    if (!dbResult.success) {
      s.stop(pc.red("Database creation failed"));
      p.log.error(dbResult.error || "Failed to create database");
      process.exit(1);
    }
    serviceId = dbResult.service_id;
    s.stop(pc.green(`Database creation initiated (${serviceId})`));
  }

  // Scaffold app
  s.start("Scaffolding project...");
  const scaffoldResult = await scaffoldApp({
    appName: projectName,
    directory,
    installDeps: false,
  });

  if (!scaffoldResult.success) {
    s.stop(pc.red("Failed to scaffold project"));
    p.log.error(scaffoldResult.message);
    process.exit(1);
  }

  s.stop(pc.green("Scaffolded project"));

  // Install dependencies
  const appPath = scaffoldResult.path!;
  s.start("Installing dependencies...");
  try {
    const execAsync = promisify(exec);
    await execAsync("npm install --loglevel=error", { cwd: appPath });
    s.stop(pc.green("Installed dependencies"));
  } catch (err) {
    s.stop(pc.yellow("npm install failed (you can retry manually)"));
  }

  // Wait for database to be ready (whether new or existing that was started)
  if (serviceId) {
    s.start("Checking database status...");
    const ready = await waitForDatabase(serviceId, 3 * 60 * 1000);
    if (!ready) {
      s.stop(pc.red("Database failed to start"));
      p.log.error("Database did not become ready in time. Please check Tiger Cloud dashboard.");
      process.exit(1);
    }
    s.stop(pc.green("Database is ready"));
  }

  if (serviceId) {
    s.start("Configuring database schema...");
    const schemaName = projectName.replace(/-/g, "_");
    const schemaResult = await setupAppSchema({
      directory: appPath,
      serviceId,
      appName: schemaName,
    });

    if (schemaResult.success) {
      s.stop(pc.green("Database schema configured"));
    } else {
      // Database might still be provisioning — try waiting
      if (dbChoice === "new") {
        s.message("Database still provisioning, waiting...");
        const ready = await waitForDatabase(serviceId);
        if (ready) {
          const retry = await setupAppSchema({
            directory: appPath,
            serviceId,
            appName: schemaName,
          });
          if (retry.success) {
            s.stop(pc.green("Database schema configured"));
          } else {
            s.stop(pc.yellow("Schema setup failed"));
            p.log.warn(retry.message);
          }
        } else {
          s.stop(pc.yellow("Database not ready yet"));
          p.log.warn(
            `Run later: crayon local run won't retry. Use the MCP tools or set up manually.`,
          );
        }
      } else {
        s.stop(pc.yellow("Schema setup failed"));
        p.log.warn(schemaResult.message);
      }
    }
  }

  // ── Launch? ─────────────────────────────────────────────────────────
  const launchChoice = await p.select({
    message: "Launch now?",
    options: [
      { value: "normal" as const, label: "Yes" },
      { value: "yolo" as const, label: "Yes, with --dangerously-skip-permissions" },
      { value: "no" as const, label: "No, I'll do it later" },
    ],
  });

  if (!p.isCancel(launchChoice) && launchChoice !== "no") {
    p.outro(pc.green("Launching..."));
    await launchDevServer(resolve(appPath), { yolo: launchChoice === "yolo", withAuthServer: opts?.withAuthServer });
    return;
  }

  // ── Done ────────────────────────────────────────────────────────────
  p.outro(pc.green(`Project created at ${directory}`));
  console.log();
  console.log(pc.bold("  To launch later:"));
  console.log(pc.cyan(`  cd ${directory} && crayon local run`));
  console.log();
}
