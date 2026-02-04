#!/usr/bin/env node
const { spawn } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

const settingsFile = join(process.env.HOME, ".config/0pflow/settings.json");

let cmd = ["npx", "-y", "0pflow@latest", "mcp", "start"];

if (existsSync(settingsFile)) {
  try {
    const settings = JSON.parse(readFileSync(settingsFile, "utf-8"));
    if (settings.mcpCommand?.length) {
      cmd = settings.mcpCommand;
    }
  } catch {}
}

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
