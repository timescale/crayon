import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import * as dotenv from "dotenv";
import { apiCall } from "../connections/cloud-client.js";
import { isAuthenticated, authenticate } from "../connections/cloud-auth.js";

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
  error?: string;
}

// Files/directories to exclude from the deployment tarball
const EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  ".dbos",
  ".next",
  "venv",
  ".venv",
  ".python-version",
  "dbos-config.yaml",
  ".env",
  ".env.local",
  "package-lock.json",
];

/**
 * Core deploy logic — usable by both CLI and Dev UI server.
 */
export async function deploy(
  projectDir: string,
  options: DeployOptions = {},
): Promise<DeployResult> {
  const progress = options.onProgress ?? (() => {});

  // ── Step 1: Pre-flight checks ──────────────────────────────────
  progress({ step: "preflight", message: "Running pre-flight checks..." });

  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      success: false,
      error: "No package.json found. Run from a 0pflow app directory.",
    };
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    name?: string;
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies?.["0pflow"]) {
    return {
      success: false,
      error: "Not a 0pflow app (0pflow not in dependencies).",
    };
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
      return {
        success: false,
        error: "Not authenticated. Run `0pflow login` first.",
      };
    }
  }

  // ── Step 3: Prepare (create Fly app) ──────────────────────────
  progress({ step: "preparing", message: "Preparing deployment..." });

  let appUrl: string;

  try {
    const result = (await apiCall("POST", "/api/deploy/prepare", {
      appName,
    })) as { appUrl: string };

    appUrl = result.appUrl;
  } catch (err) {
    return {
      success: false,
      error: `Prepare failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 4: Package app as tar.gz ──────────────────────────────
  progress({ step: "packaging", message: "Packaging application..." });

  let archive: string;
  try {
    archive = createDeploymentTarball(projectDir);
  } catch (err) {
    return {
      success: false,
      error: `Packaging failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 5: Push (upload + kick off build) ─────────────────────
  progress({ step: "uploading", message: "Uploading and building..." });

  // Filter env vars — exclude setup-only keys
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

  try {
    await apiCall("POST", "/api/deploy/push", {
      appName,
      archive,
      envVars: envVarsToSync,
    });
  } catch (err) {
    return {
      success: false,
      error: `Push failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Step 6: Poll for build + service availability ──────────────
  progress({
    step: "polling",
    message: "Building and starting app...",
  });

  const pollStart = Date.now();
  const pollTimeout = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 3000; // 3 seconds

  while (Date.now() - pollStart < pollTimeout) {
    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const status = (await apiCall(
        "GET",
        `/api/deploy/status?appName=${encodeURIComponent(appName)}`,
      )) as { status: string; url?: string; error?: string; message?: string };

      if (status.status === "running") {
        const url = status.url ?? appUrl;
        progress({ step: "done", url });
        return { success: true, url };
      }

      if (status.status === "build_error") {
        return {
          success: false,
          error: `Build failed: ${status.error ?? "Unknown error"}. Check logs with: 0pflow deploy --logs`,
        };
      }

      // Update progress message based on current step
      if (status.status === "building") {
        progress({
          step: "polling",
          message: status.message ?? "Building application...",
        });
      } else if (status.status === "starting") {
        progress({
          step: "polling",
          message: "Starting application...",
        });
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
export async function runDeploy(
  options: { verbose?: boolean } = {},
): Promise<void> {
  p.intro(pc.bold("0pflow deploy"));

  const s = p.spinner();
  let currentStep = "";

  let currentMessage = "";

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
      if (prog.message) {
        if (prog.step !== currentStep) {
          if (currentStep) {
            s.stop(pc.green("Done"));
          }
          currentStep = prog.step;
          currentMessage = prog.message;
          s.start(prog.message);
        } else if (prog.message !== currentMessage) {
          currentMessage = prog.message;
          s.message(prog.message);
        }
      }
    },
  });

  if (result.success) {
    if (result.url) {
      p.log.info(`URL: ${pc.cyan(result.url)}`);
    }
    p.outro(pc.green("Deploy complete!"));
  } else {
    p.log.error(result.error ?? "Deploy failed");
    p.outro(pc.red("Deploy failed"));
    process.exit(1);
  }
}

// ── Tarball Packaging ─────────────────────────────────────────────

/**
 * Create a deployment tar.gz as a base64 string using system tar.
 */
function createDeploymentTarball(projectDir: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "opflow-deploy-"));
  const tarPath = join(tmpDir, "app.tar.gz");

  try {
    const excludeArgs = EXCLUDE_PATTERNS.map(
      (p) => `--exclude=${p}`,
    ).join(" ");

    execSync(`tar czf ${tarPath} ${excludeArgs} .`, {
      cwd: projectDir,
      stdio: "pipe",
    });

    const tarBuffer = readFileSync(tarPath);
    return tarBuffer.toString("base64");
  } finally {
    // Clean up temp dir
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
