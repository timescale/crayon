import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir, userInfo } from "node:os";
import * as p from "@clack/prompts";
import pc from "picocolors";
import * as dotenv from "dotenv";
import { apiCall } from "../connections/cloud-client.js";
import { isAuthenticated, authenticate } from "../connections/cloud-auth.js";
import { createDatabase, setupAppSchema } from "./mcp/lib/scaffolding.js";

// ── Browser helper ───────────────────────────────────────────────

function openInBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  try {
    execSync(`${cmd} "${url}"`, { stdio: "ignore" });
  } catch {
    // best-effort — ignore if browser can't be opened
  }
}

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

export async function runCloudRun(): Promise<void> {
  p.intro(pc.bold("0pflow cloud run"));

  // ── Step 1: Authenticate with 0pflow cloud ────────────────────
  if (!isAuthenticated()) {
    p.log.info("Authenticating with 0pflow cloud...");
    await authenticate();
    if (!isAuthenticated()) {
      p.log.error("Not authenticated. Run `0pflow login` first.");
      process.exit(1);
    }
  }

  // ── Step 2: Choose existing workspace or create new ───────────
  let existingSandboxes: DevMachine[] = [];
  try {
    existingSandboxes = (await apiCall("GET", "/api/cloud-dev/list")) as DevMachine[];
  } catch {
    // ignore — treat as no existing sandboxes
  }

  let appName: string;

  if (existingSandboxes.length > 0) {
    const choice = await p.select({
      message: "Workspace",
      options: [
        ...existingSandboxes.map((m) => ({
          value: m.app_name,
          label: `${m.app_name} — ${m.fly_state}`,
        })),
        { value: "__new__", label: "Create a new workspace" },
      ],
    });

    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (choice !== "__new__") {
      const existing = existingSandboxes.find((m) => m.app_name === choice);
      if (existing?.app_url) {
        p.log.info(`URL: ${pc.cyan(existing.app_url)}`);
        openInBrowser(existing.app_url);
      }
      p.log.info(`Status: ${pc.bold(existing?.fly_state ?? "unknown")}`);
      p.outro(pc.green("Sandbox ready."));
      return;
    }

    const nameInput = await p.text({
      message: "Workspace name",
      placeholder: "my-app",
      validate: (value) => {
        if (!value) return "Name is required";
        if (!/^[a-z][a-z0-9-]*$/.test(value))
          return "Must start with a letter, only lowercase letters, numbers, and hyphens";
        return undefined;
      },
    });
    if (p.isCancel(nameInput)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    appName = nameInput as string;
  } else {
    const nameInput = await p.text({
      message: "Workspace name",
      placeholder: "my-app",
      validate: (value) => {
        if (!value) return "Name is required";
        if (!/^[a-z][a-z0-9-]*$/.test(value))
          return "Must start with a letter, only lowercase letters, numbers, and hyphens";
        return undefined;
      },
    });
    if (p.isCancel(nameInput)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    appName = nameInput as string;
  }

  // ── Step 3: Collect Claude Code credentials ───────────────────
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

  const s = p.spinner();

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
      DBOS_SYSTEM_DATABASE_URL: envVars.DATABASE_URL ?? "",
    };

    if (envVars.DBOS_ADMIN_URL) {
      machineEnvVars.DBOS_ADMIN_URL = envVars.DBOS_ADMIN_URL;
    }
    if (opflowToken) {
      machineEnvVars.OPFLOW_TOKEN = opflowToken;
    }

    // ── Step 8: Create cloud dev machine via auth-server ─────────
    s.start("Creating cloud dev sandbox...");

    let createResult: { appUrl: string; status: string };
    try {
      createResult = (await apiCall("POST", "/api/cloud-dev/create", {
        appName: appName as string,
        envVars: machineEnvVars,
      })) as { appUrl: string; status: string };
    } catch (err) {
      s.stop(pc.red("Failed to create cloud dev sandbox"));
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    s.stop(pc.green("Sandbox created"));

    // ── Step 9: Poll for sandbox to be running ───────────────────
    s.start("Waiting for sandbox to start...");

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
          const url = statusResult.url ?? createResult.appUrl;
          s.stop(pc.green("Sandbox is running!"));
          p.log.info(`URL: ${pc.cyan(url)}`);
          openInBrowser(url);
          p.outro(pc.green("Cloud dev environment is ready!"));
          return;
        }

        if (statusResult.status === "error") {
          s.stop(pc.red("Sandbox failed to start"));
          p.log.error("Check logs with: 0pflow cloud status");
          process.exit(1);
        }

        s.message(`Sandbox state: ${statusResult.status}...`);
      } catch {
        // Continue polling on transient errors
      }
    }

    s.stop(pc.yellow("Sandbox is still starting"));
    p.log.info(`URL: ${pc.cyan(createResult.appUrl)}`);
    p.log.info("Sandbox is taking longer than expected. Check status with:");
    p.log.info("  0pflow cloud status");
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

// ── Lifecycle subcommands (exported for CLI) ────────────────────

interface DevMachine {
  app_name: string;
  fly_app_name: string;
  app_url: string;
  fly_state: string;
  role: string;
}

const STOPPED_STATES = new Set(["stopped", "suspended", "destroyed"]);

async function selectMachine(opts?: { excludeStopped?: boolean }): Promise<string> {
  let all: DevMachine[] = [];
  try {
    all = (await apiCall("GET", "/api/cloud-dev/list")) as DevMachine[];
  } catch (err) {
    p.log.error(
      `Failed to list workspaces: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const machines = opts?.excludeStopped
    ? all.filter((m) => !STOPPED_STATES.has(m.fly_state ?? ""))
    : all;

  if (all.length === 0) {
    p.log.info("No cloud dev workspaces found.");
    process.exit(0);
  }

  if (machines.length === 0) {
    p.log.info("No running workspaces found.");
    process.exit(0);
  }

  if (machines.length === 1) {
    p.log.info(`Using: ${machines[0].app_name}`);
    return machines[0].app_name;
  }

  const choice = await p.select({
    message: "Select workspace",
    options: machines.map((m) => ({
      value: m.app_name,
      label: `${m.app_name} — ${m.fly_state}`,
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

export async function handleStatus(): Promise<void> {
  await ensureAuth();

  process.stdout.write("Fetching workspaces...");

  let machines: DevMachine[] = [];
  try {
    machines = (await apiCall("GET", "/api/cloud-dev/list")) as DevMachine[];
    process.stdout.write("\r\x1b[K");
  } catch (err) {
    process.stdout.write("\r\x1b[K");
    console.error(pc.red(err instanceof Error ? err.message : String(err)));
    return;
  }

  if (machines.length === 0) {
    console.log("No cloud dev workspaces found.");
    return;
  }

  const nameW = Math.max(9, ...machines.map((m) => m.app_name.length));
  const stateW = Math.max(5, ...machines.map((m) => (m.fly_state ?? "unknown").length));
  const header = `  ${"WORKSPACE".padEnd(nameW)}  ${"STATE".padEnd(stateW)}  URL`;
  const divider = `  ${"-".repeat(nameW)}  ${"-".repeat(stateW)}  ${"-".repeat(40)}`;

  console.log(pc.bold(header));
  console.log(pc.dim(divider));
  for (const m of machines) {
    const state = m.fly_state ?? "unknown";
    const stateColored =
      state === "started" ? pc.green(state.padEnd(stateW))
      : state === "stopped" || state === "suspended" ? pc.yellow(state.padEnd(stateW))
      : pc.dim(state.padEnd(stateW));
    console.log(`  ${m.app_name.padEnd(nameW)}  ${stateColored}  ${pc.cyan(m.app_url ?? "")}`);
  }
}

export async function handleStop(): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine({ excludeStopped: true });

  const s = p.spinner();
  s.start("Stopping sandbox...");

  try {
    await apiCall("POST", "/api/cloud-dev/stop", { appName });
    s.stop(pc.green("Sandbox stopped"));
  } catch (err) {
    s.stop(pc.red("Failed"));
    p.log.error(err instanceof Error ? err.message : String(err));
  }

  p.outro("");
}

export async function handleDestroy(): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine();

  const confirm = await p.confirm({
    message: `Destroy workspace "${appName}"? This permanently deletes all workflows, code, and data in the workspace and cannot be undone.`,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    return;
  }

  const s = p.spinner();
  s.start("Destroying workspace...");

  try {
    await apiCall("POST", "/api/cloud-dev/destroy", { appName });
    s.stop(pc.green("Workspace destroyed"));
  } catch (err) {
    s.stop(pc.red("Failed"));
    p.log.error(err instanceof Error ? err.message : String(err));
  }

  p.outro("");
}

// ── SSH connection helpers ──────────────────────────────────────

interface SSHKeyInfo {
  privateKey: string;
  linuxUser: string;
  host: string;
  port: number;
}

const SSH_KEYS_DIR = join(homedir(), ".0pflow", "keys");

function getCachedKeyPath(appName: string): string {
  return join(SSH_KEYS_DIR, appName);
}

async function getSSHKey(appName: string): Promise<SSHKeyInfo> {
  // Try cached key first
  const keyPath = getCachedKeyPath(appName);
  if (existsSync(keyPath)) {
    // Still need connection info from the API — read from cached metadata
    const metaPath = `${keyPath}.json`;
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as SSHKeyInfo;
      meta.privateKey = readFileSync(keyPath, "utf-8");
      return meta;
    }
  }

  // Fetch from API
  const result = (await apiCall(
    "GET",
    `/api/cloud-dev/ssh-key?appName=${encodeURIComponent(appName)}`,
  )) as SSHKeyInfo;

  // Cache locally
  mkdirSync(SSH_KEYS_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(keyPath, result.privateKey, { mode: 0o600 });
  writeFileSync(
    `${keyPath}.json`,
    JSON.stringify({
      linuxUser: result.linuxUser,
      host: result.host,
      port: result.port,
    }),
  );

  return result;
}

function connectSSH(info: SSHKeyInfo, command?: string): number {
  // Use cached key file, or write a temp one
  let keyFile = getCachedKeyPath(info.host.replace(/\.fly\.dev$/, ""));
  if (!existsSync(keyFile)) {
    mkdirSync(SSH_KEYS_DIR, { recursive: true, mode: 0o700 });
    keyFile = join(SSH_KEYS_DIR, `tmp-${Date.now()}`);
    writeFileSync(keyFile, info.privateKey, { mode: 0o600 });
  }

  const args = [
    "-i", keyFile,
    "-t",
    "-p", String(info.port),
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    `${info.linuxUser}@${info.host}`,
  ];

  if (command) {
    args.push(command);
  }

  const result = spawnSync("ssh", args, { stdio: "inherit" });
  return result.status ?? 1;
}

export async function handleClaude(extraArgs: string[] = []): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine({ excludeStopped: true });

  const s = p.spinner();
  s.start("Fetching SSH credentials...");

  let sshInfo: SSHKeyInfo;
  try {
    sshInfo = await getSSHKey(appName);
    s.stop(pc.green(`Connecting to ${appName}`));
  } catch (err) {
    s.stop(pc.red("Failed to get SSH key"));
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const allArgs = ["--dangerously-skip-permissions", ...extraArgs];
  const exitCode = connectSSH(sshInfo, `cd /data/app && exec claude ${allArgs.join(" ")}`);
  process.exit(exitCode);
}

export async function handleSSH(): Promise<void> {
  await ensureAuth();
  const appName = await selectMachine({ excludeStopped: true });

  const s = p.spinner();
  s.start("Fetching SSH credentials...");

  let sshInfo: SSHKeyInfo;
  try {
    sshInfo = await getSSHKey(appName);
    s.stop(pc.green(`Connecting to ${appName}`));
  } catch (err) {
    s.stop(pc.red("Failed to get SSH key"));
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const exitCode = connectSSH(sshInfo);
  process.exit(exitCode);
}
