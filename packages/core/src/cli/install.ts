import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";

export interface McpCommandResult {
  command: string[];
  isLocal: boolean;
  packageRoot?: string;
}

export interface InstallSettings {
  mcpCommand: string[];
  installedAt: string;
}

/**
 * Build the MCP command by taking the current invocation and replacing "install" with "mcp start"
 */
export function buildMcpCommand(): McpCommandResult {
  const args = [...process.argv];

  // Find and replace "install" with "mcp", "start"
  const installIndex = args.findIndex(arg => arg === "install");
  const baseArgs = installIndex !== -1
    ? args.slice(0, installIndex)
    : args;

  const scriptPath = baseArgs[1] || "";

  // If we're running a .ts file, tsx hides itself from argv
  // so we see "node file.ts" but need "npx tsx file.ts" to actually run it
  if (scriptPath.endsWith(".ts")) {
    // Script is at packages/core/src/cli/index.ts, repo root is 4 levels up
    const packageRoot = resolve(dirname(scriptPath), "../../../..");
    return {
      command: ["npx", "tsx", scriptPath, "mcp", "start"],
      isLocal: true,
      packageRoot,
    };
  }

  // If running from npx cache or node_modules, use npx 0pflow@version
  if (scriptPath.includes(".npm/_npx") || scriptPath.includes("node_modules/0pflow")) {
    // Try to get version from npm_lifecycle_script (e.g., "0pflow@latest")
    const npmScript = process.env.npm_lifecycle_script;
    if (npmScript?.startsWith("0pflow")) {
      return {
        command: ["npx", "-y", npmScript, "mcp", "start"],
        isLocal: false,
      };
    }
    // Fallback to latest
    return {
      command: ["npx", "-y", "0pflow@latest", "mcp", "start"],
      isLocal: false,
    };
  }

  return {
    command: [...baseArgs, "mcp", "start"],
    isLocal: false,
  };
}

/**
 * Get the settings directory path
 */
export function getSettingsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return join(home, ".config", "0pflow");
}

/**
 * Get the settings file path
 */
export function getSettingsPath(): string {
  return join(getSettingsDir(), "settings.json");
}

/**
 * Read current settings
 */
export function readSettings(): InstallSettings | null {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write settings to disk
 */
export function writeSettings(settings: InstallSettings): void {
  const settingsDir = getSettingsDir();
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Check if Claude Code CLI is available
 */
export function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Add the 0pflow marketplace to Claude Code
 */
export function addMarketplace(mcpResult: McpCommandResult, stdio: "inherit" | "ignore" = "inherit"): { success: boolean; error?: string } {
  try {
    const marketplaceSource = mcpResult.isLocal && mcpResult.packageRoot
      ? mcpResult.packageRoot
      : "timescale/0pflow";
    execSync(`claude plugin marketplace add ${marketplaceSource}`, { stdio });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Install the 0pflow plugin to Claude Code
 */
export function installPlugin(stdio: "inherit" | "ignore" = "inherit"): { success: boolean; error?: string } {
  try {
    execSync("claude plugin install 0pflow", { stdio });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export interface InstallOptions {
  force?: boolean;
  verbose?: boolean;
}

/**
 * Run the install command
 */
export async function runInstall(options: InstallOptions = {}): Promise<void> {
  const { verbose = false } = options;

  // Check if Claude CLI is available
  if (!isClaudeCliAvailable()) {
    console.log(pc.red("Error: Claude Code CLI not found."));
    console.log(pc.dim("Install Claude Code first: https://claude.ai/code"));
    process.exit(1);
  }

  // Build MCP command from current invocation
  const mcpResult = buildMcpCommand();

  if (verbose) {
    console.log(pc.dim("MCP command:"), mcpResult.command.join(" "));
  }

  // Check for existing installation
  const existingSettings = readSettings();
  if (existingSettings && !options.force) {
    console.log(pc.yellow("Already installed."), pc.dim("Use --force to reinstall."));
    return;
  }

  if (existingSettings) {
    console.log(pc.dim("Existing installation found, reinstalling (--force)..."));
    await runUninstall({ verbose });
  }

  // Write settings
  const settings: InstallSettings = {
    mcpCommand: mcpResult.command,
    installedAt: new Date().toISOString(),
  };
  writeSettings(settings);

  // Add marketplace (suppress claude CLI output in non-verbose mode)
  const stdio = verbose ? "inherit" : "ignore";
  const marketplaceResult = addMarketplace(mcpResult, stdio);
  const pluginResult = installPlugin(stdio);

  if (verbose) {
    console.log(marketplaceResult.success ? pc.green("✓ Marketplace added") : pc.yellow("⚠ Marketplace may already exist"));
    console.log(pluginResult.success ? pc.green("✓ Plugin installed") : pc.red("✗ Plugin install failed"));
  }

  if (pluginResult.success) {
    console.log();
    console.log(pc.red("   ___        __ _"));
    console.log(pc.red("  / _ \\ _ __ / _| | _____      __"));
    console.log(pc.red(" | | | | '_ \\ |_| |/ _ \\ \\ /\\ / /"));
    console.log(pc.red(" | |_| | |_) |  _| | (_) \\ V  V /"));
    console.log(pc.red("  \\___/| .__/|_| |_|\\___/ \\_/\\_/"));
    console.log(pc.red("       |_|"));
    console.log();
    console.log(pc.green("✓"), "Installed successfully");
    console.log();
    console.log(pc.bold("Next steps:"));
    console.log(pc.dim("  1. Restart Claude Code in a new project folder"));
    console.log(pc.dim("  2. Ask Claude to create a workflow, e.g.:"));
    console.log(pc.cyan('     "Create a workflow that enriches leads from a CSV file"'));
    console.log();
  } else {
    console.log(pc.red("✗"), "Installation failed");
    process.exit(1);
  }
}

export interface UninstallOptions {
  verbose?: boolean;
}

/**
 * Run the uninstall command
 */
export async function runUninstall(options: UninstallOptions = {}): Promise<void> {
  const { verbose = false } = options;
  const stdio = verbose ? "inherit" : "ignore";

  // Uninstall plugin and marketplace from Claude
  if (isClaudeCliAvailable()) {
    try {
      execSync("claude plugin uninstall 0pflow", { stdio });
      if (verbose) console.log(pc.green("✓"), "Plugin uninstalled");
    } catch {
      if (verbose) console.log(pc.yellow("⚠"), "Could not uninstall plugin");
    }

    try {
      execSync("claude plugin marketplace remove 0pflow", { stdio });
      if (verbose) console.log(pc.green("✓"), "Marketplace removed");
    } catch {
      if (verbose) console.log(pc.yellow("⚠"), "Could not remove marketplace");
    }
  }

  // Remove settings file
  const settingsPath = getSettingsPath();
  if (existsSync(settingsPath)) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(settingsPath);
    if (verbose) console.log(pc.green("✓"), "Settings file removed");
  }

  if (verbose) {
    console.log(pc.green("Uninstalled."));
  }
}
