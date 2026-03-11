import { stdioServerFactory } from "@tigerdata/mcp-boilerplate";
import { readFileSync, existsSync } from "node:fs";
import { version } from "./config.js";
import type { ServerContext } from "./types.js";
import { getSandboxApiFactories } from "./sandbox-tools/index.js";

export const PROJECT_ROOT = "/data/app";

export const serverInfo = {
  name: "crayon-sandbox-tools",
  version,
} as const;

const context: ServerContext = {};

export function buildInstructions(): string {
  const sections: string[] = [];

  // ── Sandbox environment ──────────────────────────────────────
  const envLines = [
    "## Sandbox Environment",
    "",
    "You are connected to a remote cloud sandbox via MCP.",
    "All file operations, bash commands, and crayon tools run on the sandbox, not on the user's local machine.",
    `Project root: ${PROJECT_ROOT}`,
  ];

  const flyAppName = process.env.FLY_APP_NAME;
  if (flyAppName) {
    const publicUrl = `https://${flyAppName}.fly.dev`;
    envLines.push(
      `Public URL: ${publicUrl}`,
      `Dev UI: ${publicUrl}/dev/`,
      "The app's dev server is accessible at the public URL above — NOT at localhost.",
    );
  }
  sections.push(envLines.join("\n"));

  // ── Project CLAUDE.md (if exists) ────────────────────────────
  const claudeMdPath = `${PROJECT_ROOT}/CLAUDE.md`;
  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, "utf-8").trim();
      if (content) {
        sections.push(`## Project Instructions (CLAUDE.md)\n\n${content}`);
      }
    } catch {
      // skip if unreadable
    }
  }

  // ── Crayon workflow engine context ───────────────────────────
  sections.push(CRAYON_CONTEXT);

  return sections.join("\n\n---\n\n");
}

const CRAYON_CONTEXT = `## Crayon Workflow Engine

You have access to crayon MCP tools for building and running AI-native workflows.

### Workflow Development Pipeline

1. **Design** (\`create-workflow\`) — write workflow + node stubs with \`description\` fields capturing intent
2. **Refine** (\`refine-node\`) — add typed Zod schemas, tools, SDK setup, check connections
3. **Compile** (\`compile-workflow\`) — regenerate the workflow's \`run()\` method from descriptions

**Each phase has a skill guide.** Call \`get_skill_guide\` with the phase name (e.g., \`create-workflow\`) before starting. The guides contain all templates, connection gates, and step-by-step instructions. Follow them — do not improvise steps from other phases.

### Key Patterns

- **Description-driven:** The \`description\` field in workflows and nodes is the source of truth
- **Node types:** \`Node.create()\` for deterministic functions, \`Agent.create()\` for AI reasoning
- **Draft first, ask later:** Make your best guess and let the user correct
- **Run it yourself:** When the user wants to test, use \`run_workflow\` / \`run_node\` tools directly

### File Locations

| Type | Location |
|------|----------|
| Workflows | \`src/crayon/workflows/*.ts\` |
| Nodes | \`src/crayon/nodes/*.ts\` |
| Agents | \`src/crayon/agents/*.ts\` + \`*.md\` (colocated spec) |
| Integrations | \`src/crayon/integrations/*.ts\` |`;

/**
 * Start the sandbox MCP server in stdio mode.
 * Exposes filesystem and bash tools for remote sandbox access.
 */
export async function startSandboxMcpServer(): Promise<void> {
  // Ensure cwd is the project root so crayon tools (listWorkflows, runWorkflow, etc.)
  // discover workflows and load .env correctly — SSH sessions may start in $HOME instead.
  if (existsSync(PROJECT_ROOT)) {
    process.chdir(PROJECT_ROOT);
  }

  const apiFactories = await getSandboxApiFactories();

  await stdioServerFactory({
    ...serverInfo,
    context,
    apiFactories,
    instructions: buildInstructions(),
  });
}
