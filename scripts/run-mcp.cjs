#!/usr/bin/env node
const { spawn } = require("child_process");
const { readFileSync } = require("fs");
const { join, dirname } = require("path");

// Detect if running from Claude Code's plugin cache (production)
// vs --plugin-dir (development)
const scriptDir = __dirname;
const isPluginCache = scriptDir.includes('.claude/plugins/cache/');

let cmd;

if (isPluginCache) {
  // Production mode: running from installed plugin
  // Read version from our own package.json and use npx
  const packageJsonPath = join(scriptDir, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const version = packageJson.version;
  cmd = ['npx', '-y', `0pflow@${version}`, 'mcp', 'start'];
} else {
  // Development mode: running from --plugin-dir
  // Use npx tsx with local source
  const cliPath = join(scriptDir, '..', 'packages', 'core', 'src', 'cli', 'index.ts');
  cmd = ['npx', 'tsx', cliPath, 'mcp', 'start'];
}

// Ensure node/npm bin directory is in PATH
const env = { ...process.env };
const nodeBinDir = dirname(process.execPath);
if (!env.PATH?.includes(nodeBinDir)) {
  env.PATH = `${nodeBinDir}:${env.PATH || ""}`;
}

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
