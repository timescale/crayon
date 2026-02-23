import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir, userInfo } from "node:os";
import * as p from "@clack/prompts";
import pc from "picocolors";
import * as dotenv from "dotenv";
import { apiCall } from "../connections/cloud-client.js";
import { isAuthenticated, authenticate } from "../connections/cloud-auth.js";
import { createDatabase, setupAppSchema } from "./mcp/lib/scaffolding.js";

// ── Claude Code credential collection ───────────────────────────

function collectClaudeCredentials(): Record<string, string> {
  const home = homedir();
  const username = userInfo().username;

  // 1. OS keyring — OAuth (macOS)
  if (process.platform === "darwin") {
    try {
      const oauthJson = execSync(
        `security find-generic-password -s "Claude Code-credentials" -a "${username}" -w`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      if (oauthJson) return { CLAUDE_OAUTH_CREDENTIALS: oauthJson };
    } catch {
      /* not in keyring */
    }

    // 2. OS keyring — API key (macOS)
    try {
      const apiKey = execSync(
        `security find-generic-password -s "Claude Code" -a "${username}" -w`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      if (apiKey) return { CLAUDE_API_KEY: apiKey };
    } catch {
      /* not in keyring */
    }
  }

  // 3. File — OAuth
  const oauthPath = join(home, ".claude", ".credentials.json");
  if (existsSync(oauthPath)) {
    return { CLAUDE_OAUTH_CREDENTIALS: readFileSync(oauthPath, "utf-8") };
  }

  // 4. File — API key
  const configPath = join(home, ".claude.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
        primaryApiKey?: string;
      };
      if (config.primaryApiKey) return { CLAUDE_API_KEY: config.primaryApiKey };
    } catch {
      /* invalid JSON */
    }
  }

  // 5. Environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  }

  return {};
}

// ── Tiger CLI helpers (reused from run.ts) ──────────────────────

function ensureTigerAuth(): void {
  try {
    execSync("tiger version", { stdio: "ignore" });
  } catch {
    p.log.error(
      "Tiger CLI not found. Install it: curl -fsSL https://cli.tigerdata.com | sh",
    );
    process.exit(1);
  }

  try {
    const stdout = execSync("tiger auth status -o json", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    JSON.parse(stdout);
  } catch {
    p.log.info("Tiger Cloud authentication required. Opening browser...");
    try {
      execSync("tiger auth login", { stdio: "inherit" });
    } catch {
      p.log.error(
        "Tiger Cloud login failed. Try running 'tiger auth login' manually.",
      );
      process.exit(1);
    }
  }
}

async function waitForDatabase(
  serviceId: string,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 5000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const stdout = execSync(`tiger service get ${serviceId} -o json`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const info = JSON.parse(stdout) as { status?: string };
      if (info.status?.toLowerCase() === "ready") {
        return true;
      }
    } catch {
      // Continue retrying
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ── Main command ────────────────────────────────────────────────

export interface CloudDevOptions {
  stop?: boolean;
  status?: boolean;
  destroy?: boolean;
  verbose?: boolean;
}

export async function runCloudDev(options: CloudDevOptions): Promise<void> {
  p.intro(pc.bold("0pflow cloud-dev"));

  // Handle lifecycle subcommands
  if (options.status) {
    await handleStatus();
    return;
  }
  if (options.stop) {
    await handleStop();
    return;
  }
  if (options.destroy) {
    await handleDestroy();
    return;
  }

  // ── Step 1: Collect Claude Code credentials ────────────────────
  const claudeCreds = collectClaudeCredentials();
  if (Object.keys(claudeCreds).length === 0) {
    p.log.warn(
      "No Claude Code credentials found. The embedded terminal won't be able to use Claude.\n" +
        "Set ANTHROPIC_API_KEY or sign in to Claude Code first.",
    );
  } else {
    const credType = Object.keys(claudeCreds)[0];
    p.log.info(`Found Claude Code credentials (${credType})`);
  }

  // ── Step 2: Prompt for project name ────────────────────────────
  const appName = await p.text({
    message: "Project name",
    placeholder: "my-app",
    validate: (value) => {
      if (!value) return "Name is required";
      if (!/^[a-z][a-z0-9-]*$/.test(value))
        return "Must start with a letter, only lowercase letters, numbers, and hyphens";
      return undefined;
    },
  });

  if (p.isCancel(appName)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // ── Step 3: Authenticate with 0pflow cloud ─────────────────────
  const s = p.spinner();

  if (!isAuthenticated()) {
    p.log.info("Authenticating with 0pflow cloud...");
    await authenticate();
    if (!isAuthenticated()) {
      p.log.error("Not authenticated. Run `0pflow login` first.");
      process.exit(1);
    }
  }

  // ── Step 4: Tiger auth + choose or create database ─────────────
  ensureTigerAuth();

  let serviceId: string;

  // List existing Tiger services
  interface TigerService {
    service_id: string;
    name: string;
    status: string;
  }
  let existingServices: TigerService[] = [];
  try {
    const listOutput = execSync("tiger service list -o json", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    existingServices = JSON.parse(listOutput) as TigerService[];
  } catch {
    // tiger CLI failed — fall through to create new
  }

  if (existingServices.length > 0) {
    const dbChoice = await p.select({
      message: "Database",
      options: [
        { value: "__new__" as const, label: "Create a new database" },
        ...existingServices.map((svc) => ({
          value: svc.service_id,
          label: `${svc.name} (${svc.service_id}) — ${svc.status}`,
        })),
      ],
    });

    if (p.isCancel(dbChoice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (dbChoice === "__new__") {
      s.start("Creating database...");
      const dbResult = await createDatabase({ name: `${appName}-db` });
      if (!dbResult.success || !dbResult.service_id) {
        s.stop(pc.red("Failed to create database"));
        p.log.error(dbResult.error ?? "Unknown error");
        process.exit(1);
      }
      serviceId = dbResult.service_id;
      s.stop(pc.green(`Database created (${serviceId})`));
    } else {
      serviceId = dbChoice as string;
      p.log.info(`Using existing database: ${serviceId}`);
    }
  } else {
    s.start("Creating database...");
    const dbResult = await createDatabase({ name: `${appName}-db` });
    if (!dbResult.success || !dbResult.service_id) {
      s.stop(pc.red("Failed to create database"));
      p.log.error(dbResult.error ?? "Unknown error");
      process.exit(1);
    }
    serviceId = dbResult.service_id;
    s.stop(pc.green(`Database created (${serviceId})`));
  }

  // ── Step 5: Wait for database to be ready ──────────────────────
  s.start("Waiting for database to be ready...");
  const ready = await waitForDatabase(serviceId);
  if (!ready) {
    s.stop(pc.red("Database timeout"));
    p.log.error("Database took too long to become ready.");
    process.exit(1);
  }
  s.stop(pc.green("Database is ready"));

  // ── Step 6: Setup app schema (to temp dir for env vars) ────────
  s.start("Setting up database schema...");

  const tmpDir = mkdtempSync(join(tmpdir(), "opflow-cloud-dev-"));
  try {
    const schemaResult = await setupAppSchema({
      directory: tmpDir,
      serviceId,
      appName: appName as string,
    });

    if (!schemaResult.success) {
      s.stop(pc.red("Schema setup failed"));
      p.log.error(schemaResult.message);
      process.exit(1);
    }
    s.stop(pc.green("Database schema configured"));

    // Read env vars from the generated .env
    const envPath = join(tmpDir, ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const envVars = dotenv.parse(envContent);

    // ── Step 7: Collect all env vars for the machine ─────────────
    const { getToken } = await import("../connections/cloud-auth.js");
    const opflowToken = getToken();

    const machineEnvVars: Record<string, string> = {
      ...claudeCreds,
      DATABASE_URL: envVars.DATABASE_URL ?? "",
      DATABASE_SCHEMA: envVars.DATABASE_SCHEMA ?? "",
    };

    if (envVars.DBOS_ADMIN_URL) {
      machineEnvVars.DBOS_ADMIN_URL = envVars.DBOS_ADMIN_URL;
    }
    if (opflowToken) {
      machineEnvVars.OPFLOW_TOKEN = opflowToken;
    }

    // ── Step 8: Create cloud dev machine via auth-server ─────────
    s.start("Creating cloud dev machine...");

    let createResult: { appUrl: string; status: string };
    try {
      createResult = (await apiCall("POST", "/api/cloud-dev/create", {
        appName: appName as string,
        envVars: machineEnvVars,
      })) as { appUrl: string; status: string };
    } catch (err) {
      s.stop(pc.red("Failed to create cloud dev machine"));
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    s.stop(pc.green("Machine created"));

    // ── Step 9: Poll for machine to be running ───────────────────
    s.start("Waiting for machine to start...");

    const pollTimeout = 5 * 60 * 1000;
    const pollInterval = 5000;
    const pollStart = Date.now();

    while (Date.now() - pollStart < pollTimeout) {
      await new Promise((r) => setTimeout(r, pollInterval));

      try {
        const statusResult = (await apiCall(
          "GET",
          `/api/cloud-dev/status?appName=${encodeURIComponent(appName as string)}`,
        )) as { status: string; url?: string };

        if (statusResult.status === "running") {
          s.stop(pc.green("Machine is running!"));
          p.log.info(`URL: ${pc.cyan(statusResult.url ?? createResult.appUrl)}`);
          p.outro(pc.green("Cloud dev environment is ready!"));
          return;
        }

        if (statusResult.status === "error") {
          s.stop(pc.red("Machine failed to start"));
          p.log.error("Check logs with: 0pflow cloud-dev --status");
          process.exit(1);
        }

        s.message(`Machine state: ${statusResult.status}...`);
      } catch {
        // Continue polling on transient errors
      }
    }

    s.stop(pc.yellow("Machine is still starting"));
    p.log.info(`URL: ${pc.cyan(createResult.appUrl)}`);
    p.log.info("Machine is taking longer than expected. Check status with:");
    p.log.info("  0pflow cloud-dev --status");
    p.outro(pc.yellow("Cloud dev environment is starting..."));
  } finally {
    // Clean up temp dir
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

// ── Lifecycle subcommands ───────────────────────────────────────

interface DevMachine {
  app_name: string;
  fly_app_name: string;
  app_url: string;
  machine_status: string;
  role: string;
}

async function selectMachine(): Promise<string> {
  let machines: DevMachine[] = [];
  try {
    machines = (await apiCall("GET", "/api/cloud-dev/list")) as DevMachine[];
  } catch (err) {
    p.log.error(
      `Failed to list machines: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (machines.length === 0) {
    p.log.info("No cloud dev machines found.");
    process.exit(0);
  }

  if (machines.length === 1) {
    p.log.info(`Using: ${machines[0].app_name}`);
    return machines[0].app_name;
  }

  const choice = await p.select({
    message: "Select machine",
    options: machines.map((m) => ({
      value: m.app_name,
      label: `${m.app_name} — ${m.machine_status}`,
    })),
  });

  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  return choice as string;
}

async function ensureAuth(): Promise<void> {
  if (!isAuthenticated()) {
    await authenticate();
    if (!isAuthenticated()) {
      p.log.error("Not authenticated. Run `0pflow login` first.");
      process.exit(1);
    }
  }
}

async function handleStatus(): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine();

  const s = p.spinner();
  s.start("Checking status...");

  try {
    const result = (await apiCall(
      "GET",
      `/api/cloud-dev/status?appName=${encodeURIComponent(appName)}`,
    )) as { status: string; url?: string; error?: string };

    s.stop(pc.green("Done"));

    if (result.status === "not_found") {
      p.log.info("No cloud dev machine found for this project.");
    } else {
      p.log.info(`Status: ${pc.bold(result.status)}`);
      if (result.url) {
        p.log.info(`URL: ${pc.cyan(result.url)}`);
      }
      if (result.error) {
        p.log.error(result.error);
      }
    }
  } catch (err) {
    s.stop(pc.red("Failed"));
    p.log.error(err instanceof Error ? err.message : String(err));
  }

  p.outro("");
}

async function handleStop(): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine();

  const s = p.spinner();
  s.start("Stopping machine...");

  try {
    await apiCall("POST", "/api/cloud-dev/stop", { appName });
    s.stop(pc.green("Machine stopped"));
  } catch (err) {
    s.stop(pc.red("Failed"));
    p.log.error(err instanceof Error ? err.message : String(err));
  }

  p.outro("");
}

async function handleDestroy(): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine();

  const confirm = await p.confirm({
    message: `Destroy cloud dev machine for "${appName}"? This deletes all data on the volume.`,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    return;
  }

  const s = p.spinner();
  s.start("Destroying machine...");

  try {
    await apiCall("POST", "/api/cloud-dev/destroy", { appName });
    s.stop(pc.green("Machine destroyed"));
  } catch (err) {
    s.stop(pc.red("Failed"));
    p.log.error(err instanceof Error ? err.message : String(err));
  }

  p.outro("");
}
