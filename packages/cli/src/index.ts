#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
  .name("crayon")
  .description("Crayon CLI — cloud dev environments")
  .version(pkg.version)
  .enablePositionalOptions();

program
  .command("run")
  .description("Create a cloud dev environment on Fly.io")
  .action(async () => {
    const { runCloudRun } = await import("@crayon/core/cli/cloud-dev");
    await runCloudRun();
  });

program
  .command("status")
  .description("Check cloud dev machine status")
  .action(async () => {
    const { handleStatus } = await import("@crayon/core/cli/cloud-dev");
    await handleStatus();
  });

program
  .command("stop")
  .description("Stop the cloud dev machine")
  .action(async () => {
    const { handleStop } = await import("@crayon/core/cli/cloud-dev");
    await handleStop();
  });

program
  .command("destroy")
  .description("Destroy the cloud dev machine and its volume")
  .action(async () => {
    const { handleDestroy } = await import("@crayon/core/cli/cloud-dev");
    await handleDestroy();
  });

program
  .command("claude")
  .description("SSH into a cloud workspace and start a Claude Code session")
  .allowUnknownOption()
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(async (_opts, cmd) => {
    const { handleClaude } = await import("@crayon/core/cli/cloud-dev");
    await handleClaude(cmd.args);
  });

program
  .command("ssh")
  .description("SSH into a cloud workspace")
  .action(async () => {
    const { handleSSH } = await import("@crayon/core/cli/cloud-dev");
    await handleSSH();
  });

program.parse();
