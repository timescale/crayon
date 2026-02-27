#!/usr/bin/env node
const { spawn } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { join, dirname } = require("path");

const settingsFile = join(process.env.HOME, ".config/crayon/settings.json");

let cmd = ["npx", "-y", "crayon@latest", "mcp", "start"];

if (existsSync(settingsFile)) {
  try {
    const settings = JSON.parse(readFileSync(settingsFile, "utf-8"));
    if (settings.mcpCommand?.length) {
      cmd = settings.mcpCommand;
    }
  } catch {}
}

// Ensure the node/npm bin directory is in PATH (Claude Code may launch
// this via sh which doesn't inherit nvm/fnm PATH entries)
const env = { ...process.env };
const nodeBinDir = dirname(process.execPath);
if (!env.PATH?.includes(nodeBinDir)) {
  env.PATH = `${nodeBinDir}:${env.PATH || ""}`;
}

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
