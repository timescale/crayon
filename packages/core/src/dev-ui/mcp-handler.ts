/**
 * MCP HTTP handler for the dev server.
 *
 * Uses httpServerFactory from @tigerdata/mcp-boilerplate in "external app" mode,
 * mounting MCP routes on a lightweight Express sub-app that's bridged to the
 * existing raw node:http server via app(req, res).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import { httpServerFactory } from "@tigerdata/mcp-boilerplate";
import { getSandboxApiFactories } from "../cli/mcp/sandbox-tools/index.js";
import {
  buildInstructions,
  serverInfo,
} from "../cli/mcp/sandbox-server.js";

let app: ReturnType<typeof express> | null = null;

async function ensureApp() {
  if (app) return;

  const apiFactories = await getSandboxApiFactories();
  app = express();

  await httpServerFactory({
    ...serverInfo,
    context: {},
    apiFactories,
    instructions: buildInstructions(),
    stateful: false,
    app,
    mcpPath: "/",
  });
}

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await ensureApp();
  // Rewrite URL so the Express router sees "/" instead of "/dev/mcp"
  const origUrl = req.url;
  req.url = "/";
  app!(req as any, res as any);
  req.url = origUrl;
}

export async function cleanupMcp(): Promise<void> {
  // Cleanup is handled by the boilerplate's registerExitHandlers on process exit.
}
