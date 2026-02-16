import { exec, execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { promisify } from "node:util";
import { basename, join, resolve } from "node:path";
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

function isCwdEmpty(): boolean {
  try {
    const entries = readdirSync(process.cwd());
    // Ignore dotfiles like .git
    return entries.filter((e) => !e.startsWith(".")).length === 0;
  } catch {
    return true;
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

function isExisting0pflow(): boolean {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return "0pflow" in deps;
  } catch {
    return false;
  }
}

const WELCOME_PROMPT =
  "Welcome to your 0pflow project! What workflow would you like to create? Here are some ideas:\n\n" +
  '- "Enrich leads from a CSV file with company data"\n' +
  '- "Monitor website uptime and send Slack alerts"\n' +
  '- "Sync Salesforce contacts to our database nightly"\n' +
  '- "Score and route inbound leads based on firmographics"\n\n' +
  "Describe what you'd like to automate and I'll help you build it with /create-workflow.";

async function launchDevServer(cwd: string, { yolo = false }: { yolo?: boolean } = {}): Promise<void> {
  // Load .env from the app directory (not process.cwd(), which may be a parent)
  try {
    const { findEnvFile, loadEnv } = await import("./env.js");
    const envPath = findEnvFile(cwd);
    if (envPath) loadEnv(envPath);
  } catch {
    // Dev UI can work without env
  }

  // Detect dev mode (running from monorepo source) for --plugin-dir
  const { packageRoot } = await import("./mcp/config.js");
  const monorepoRoot = resolve(packageRoot, "..", "..");
  const pluginDir = existsSync(resolve(monorepoRoot, "packages", "core")) ? monorepoRoot : undefined;

  const { startDevServer } = await import("../dev-ui/index.js");
  const { url } = await startDevServer({
    projectRoot: cwd,
    databaseUrl: process.env.DATABASE_URL,
    nangoSecretKey: process.env.NANGO_SECRET_KEY,
    claudePluginDir: pluginDir,
    claudeSkipPermissions: yolo,
    claudePrompt: WELCOME_PROMPT,
  });

  // Open browser
  try {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {
    // Non-fatal — user can open manually
  }
}

export async function runRun(): Promise<void> {
  p.intro(pc.red("0pflow"));

  if (!isClaudeAvailable()) {
    p.log.error("Claude Code CLI not found. Install it from https://claude.ai/code");
    process.exit(1);
  }

  // ── Existing project → launch ───────────────────────────────────────
  if (isExisting0pflow()) {
    // Check if database is paused and start it if needed
    try {
      const { findEnvFile } = await import("./env.js");
      const envPath = findEnvFile(process.cwd());
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
    await launchDevServer(process.cwd(), { yolo: mode === "yolo" });
    return;
  }

  const cwdEmpty = isCwdEmpty();

  // ── Project name ────────────────────────────────────────────────────
  // Default to current directory name if it looks like a valid project name
  const dirName = basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const defaultName = cwdEmpty && /^[a-z][a-z0-9-]*$/.test(dirName) ? dirName : undefined;

  const projectName = await p.text({
    message: "Project name",
    ...(defaultName ? { initialValue: defaultName } : { placeholder: "my-app" }),
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

  // ── Directory ───────────────────────────────────────────────────────
  const cwd = process.cwd();
  const defaultDir = cwdEmpty ? "." : `./${projectName}`;
  const defaultLabel = cwdEmpty
    ? `${cwd} (current directory)`
    : `./${projectName}`;

  const useDirectory = await p.select({
    message: "Where should we create it?",
    options: cwdEmpty
      ? [
          { value: "default" as const, label: `Here — ${cwd}` },
          { value: "custom" as const, label: "Other directory" },
        ]
      : [
          { value: "default" as const, label: `./${projectName}` },
          { value: "custom" as const, label: "Other directory" },
        ],
  });

  if (p.isCancel(useDirectory)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  let directory: string;
  if (useDirectory === "custom") {
    const customDir = await p.text({
      message: "Directory path",
      placeholder: `./${projectName}`,
      validate(value) {
        if (!value) return "Directory is required";
      },
    });
    if (p.isCancel(customDir)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    directory = customDir;
  } else {
    directory = defaultDir;
  }

  if (p.isCancel(directory)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

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
    await execAsync("npm install", { cwd: appPath });
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
            `Run later: 0pflow run won't retry. Use the MCP tools or set up manually.`,
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
    await launchDevServer(resolve(appPath), { yolo: launchChoice === "yolo" });
    return;
  }

  // ── Done ────────────────────────────────────────────────────────────
  const cdCmd = directory === "." ? "" : `cd ${directory} && `;

  p.outro(pc.green("Project created!"));
  console.log();
  console.log(pc.bold("  To launch later:"));
  console.log(pc.cyan(`  ${cdCmd}0pflow run`));
  console.log();
}
