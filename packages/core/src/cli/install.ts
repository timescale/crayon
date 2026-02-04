import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";

export interface InstallSettings {
  mcpCommand: string[];
  installedAt: string;
}

/**
 * Build the MCP command by taking the current invocation and replacing "install" with "mcp start"
 */
export function buildMcpCommand(): string[] {
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
    return ["npx", "tsx", scriptPath, "mcp", "start"];
  }

  // If running from npx cache or node_modules, use npx 0pflow@version
  if (scriptPath.includes(".npm/_npx") || scriptPath.includes("node_modules/0pflow")) {
    // Try to get version from npm_lifecycle_script (e.g., "0pflow@latest")
    const npmScript = process.env.npm_lifecycle_script;
    if (npmScript?.startsWith("0pflow")) {
      return ["npx", "-y", npmScript, "mcp", "start"];
    }
    // Fallback to latest
    return ["npx", "-y", "0pflow@latest", "mcp", "start"];
  }

  return [...baseArgs, "mcp", "start"];
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
export function addMarketplace(): { success: boolean; error?: string } {
  try {
    execSync("claude plugin marketplace add timescale/0pflow", { stdio: "inherit" });
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
export function installPlugin(): { success: boolean; error?: string } {
  try {
    execSync("claude plugin install 0pflow", { stdio: "inherit" });
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
}

/**
 * Run the install command
 */
export async function runInstall(options: InstallOptions = {}): Promise<void> {
  console.log();
  console.log(pc.bold("0pflow Install"));
  console.log();

  // Check if Claude CLI is available
  if (!isClaudeCliAvailable()) {
    console.log(pc.red("Error: Claude Code CLI not found."));
    console.log(pc.dim("Please install Claude Code first: https://claude.ai/code"));
    process.exit(1);
  }

  // Build MCP command from current invocation
  const mcpCommand = buildMcpCommand();

  console.log(pc.dim("MCP command:"), mcpCommand.join(" "));
  console.log();

  // Check for existing installation
  const existingSettings = readSettings();
  if (existingSettings) {
    if (!options.force) {
      console.log(pc.yellow("0pflow is already installed."));
      console.log(pc.dim("Current MCP command:"), existingSettings.mcpCommand.join(" "));
      console.log();
      console.log(pc.dim("Use --force to reinstall."));
      return;
    }
    // Force reinstall - uninstall first
    console.log(pc.dim("Uninstalling existing installation..."));
    await runUninstall();
    console.log();
    console.log(pc.bold("Reinstalling 0pflow..."));
    console.log();
  }

  // Write settings
  const settings: InstallSettings = {
    mcpCommand,
    installedAt: new Date().toISOString(),
  };

  console.log(pc.dim("Writing settings to:"), getSettingsPath());
  writeSettings(settings);
  console.log(pc.green("✓"), "Settings saved");
  console.log();

  // Add marketplace
  console.log(pc.dim("Adding 0pflow marketplace..."));
  const marketplaceResult = addMarketplace();
  if (marketplaceResult.success) {
    console.log(pc.green("✓"), "Marketplace added");
  } else {
    console.log(pc.yellow("⚠"), "Could not add marketplace (may already exist)");
  }

  // Install plugin
  console.log(pc.dim("Installing 0pflow plugin..."));
  const pluginResult = installPlugin();
  if (pluginResult.success) {
    console.log(pc.green("✓"), "Plugin installed");
  } else {
    console.log(pc.red("✗"), "Failed to install plugin:", pluginResult.error);
  }

  console.log();
  console.log(pc.green(pc.bold("Installation complete!")));
  console.log();
  console.log("You can now use 0pflow in Claude Code.");
  console.log();
}

/**
 * Run the uninstall command
 */
export async function runUninstall(): Promise<void> {
  console.log();
  console.log(pc.bold("0pflow Uninstall"));
  console.log();

  // Uninstall plugin and marketplace from Claude
  if (isClaudeCliAvailable()) {
    console.log(pc.dim("Uninstalling plugin from Claude Code..."));
    try {
      execSync("claude plugin uninstall 0pflow", { stdio: "inherit" });
      console.log(pc.green("✓"), "Plugin uninstalled");
    } catch {
      console.log(pc.yellow("⚠"), "Could not uninstall plugin (may not exist)");
    }

    console.log(pc.dim("Removing marketplace..."));
    try {
      execSync("claude plugin marketplace remove 0pflow", { stdio: "inherit" });
      console.log(pc.green("✓"), "Marketplace removed");
    } catch {
      console.log(pc.yellow("⚠"), "Could not remove marketplace (may not exist)");
    }
  }

  // Remove settings file
  const settingsPath = getSettingsPath();
  if (existsSync(settingsPath)) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(settingsPath);
    console.log(pc.green("✓"), "Settings file removed");
  }

  console.log();
  console.log(pc.green("Uninstallation complete."));
  console.log();
}
