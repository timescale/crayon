import { stdioServerFactory } from "@tigerdata/mcp-boilerplate";
import { readFileSync, existsSync } from "node:fs";
import { version } from "./config.js";
import type { ServerContext } from "./types.js";
import { getSandboxApiFactories } from "./sandbox-tools/index.js";

const serverInfo = {
  name: "crayon-sandbox-tools",
  version,
} as const;

const context: ServerContext = {};

const PROJECT_ROOT = "/data/app";

function buildInstructions(): string {
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

### Available MCP Tools

**Workflow execution:**
- \`list_workflows\` — discover compiled workflows
- \`run_workflow\` — execute a workflow with JSON input
- \`run_node\` — execute a single node (for testing)

**Run history:**
- \`list_runs\` — list past executions
- \`get_run\` — get details of a specific run
- \`get_trace\` — full execution trace with step-by-step output

**Integrations:**
- \`list_integrations\` — list available OAuth integrations (Salesforce, Slack, etc.)
- \`get_connection_info\` — get credentials for a specific integration + node

**Scaffolding:**
- \`create_app\` — scaffold a new crayon project
- \`create_database\` — set up a database
- \`setup_app_schema\` — initialize crayon tables in existing DB

### Workflow Development Pipeline

1. **Design** — create \`src/crayon/workflows/<name>.ts\` with a \`description\` field that captures the flow (task ordering, conditions, loops)
2. **Create stubs** — for each task, create node stubs in \`src/crayon/nodes/<name>.ts\` or agent stubs in \`src/crayon/agents/<name>.ts\` + \`<name>.md\`
3. **Refine** — add typed Zod schemas, tools, implementation details to each node/agent
4. **Compile** — update the workflow's \`run()\` method from embedded descriptions

### Key Patterns

- **Description-driven:** The \`description\` field in workflows and nodes is the source of truth. It drives code generation.
- **Node types:** \`Node.create()\` for deterministic functions, \`Agent.create()\` for AI reasoning (uses Vercel AI SDK)
- **Agent specs:** Each agent has a colocated \`.md\` file with system prompt, guidelines, and output format
- **Integrations:** Declare in \`integrations: ["salesforce", "openai"]\` array. Credentials fetched at runtime via \`ctx.getConnection()\`.
- **Draft first, ask later:** Make your best guess and let the user correct, rather than interrogating upfront.
- **Run it yourself:** When the user wants to test, use \`run_workflow\` / \`run_node\` tools directly.

### File Locations

| Type | Location |
|------|----------|
| Workflows | \`src/crayon/workflows/*.ts\` |
| Nodes | \`src/crayon/nodes/*.ts\` |
| Agents | \`src/crayon/agents/*.ts\` + \`*.md\` (colocated spec) |
| Agent tools | \`src/crayon/tools/*.ts\` |
| Integrations | \`src/crayon/integrations/*.ts\` |

### Workflow Scaffold Template

\`\`\`typescript
import { z } from "zod";
import { Workflow } from "runcrayon";

const InputSchema = z.object({ /* ... */ });
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({ /* ... */ });
type Output = z.infer<typeof OutputSchema>;

export const myWorkflow = Workflow.create({
  name: "my-workflow",
  version: 1,
  description: \\\`
Summary of what the workflow does.

## Tasks

### 1. Task Name
**Node:** \\\\\\\`node-name\\\\\\\` (node|agent)
\\\`,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async run(ctx, inputs: Input): Promise<Output> {
    const result = await ctx.run(myNode, { /* inputs */ });
    return { /* outputs */ };
  },
});
\`\`\`

### Node Stub Template

\`\`\`typescript
import { z } from "zod";
import { Node } from "runcrayon";

export const myNode = Node.create({
  name: "my-node",
  description: \\\`What this node does.
**Input Description:** what it needs
**Output Description:** what it produces\\\`,
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute(ctx, input) {
    return {};
  },
});
\`\`\`

### Agent Stub Template

\`\`\`typescript
import { z } from "zod";
import { Agent } from "runcrayon";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const myAgent = Agent.create({
  name: "my-agent",
  integrations: ["openai"],
  description: \\\`What this agent does.
**Input Description:** what it needs
**Output Description:** what it produces\\\`,
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  tools: {},
  specPath: path.resolve(__dirname, "./my-agent.md"),
});
\`\`\`

### Integration Gate

Before implementing nodes that use external services, call \`get_connection_info\` to verify the connection exists. If it fails, tell the user to set up the connection in the Dev UI first.`;

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
