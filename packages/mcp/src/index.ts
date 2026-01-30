#!/usr/bin/env node
import { Command } from "commander";
import { startMcpServer } from "./server.js";
import { version } from "./config.js";

const program = new Command();

program
  .name("0pflow-mcp")
  .description("MCP server for 0pflow")
  .version(version);

program
  .command("start")
  .description("Start the MCP server")
  .action(async () => {
    await startMcpServer();
  });

program.parse();
