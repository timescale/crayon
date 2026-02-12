---
name: compile-workflow
description: Update workflow implementation from its embedded description. Use this after modifying workflow or node descriptions.
---

# Compile Workflow

Updates the `run()` method of a workflow in `generated/workflows/*.ts` based on its embedded `description` field and the `description` fields in referenced nodes/agents.

**Announce at start:** "I'm using the compile-workflow skill to update the workflow implementation from its description."

---

## Pre-Flight Checks

1. **Verify workflow files exist:**
   - `generated/workflows/` must exist with at least one `.ts` file
   - If no `.ts` files found, tell user to run `/0pflow:create-workflow` first

2. **If no workflow name provided:**
   - List all workflows in `generated/workflows/`
   - Ask user to select which one to compile

3. **If workflow name provided:**
   - Verify `generated/workflows/<name>.ts` exists
   - If not, list available workflows and ask user to choose

---

## Description Parsing

### Workflow Description

Read the `description` field from the `Workflow.create()` call in `generated/workflows/<name>.ts`. The description contains flow-level information:

- **Summary** — first line/paragraph
- **`## Tasks`** — ordered list of tasks with:
  - `**Node:**` references (name + type)
  - `**Condition:**` / `**If true:**` / `**If false:**` for decisions
  - `**Loop:**` for iteration
  - `**Return:**` for terminal tasks

### Node/Agent Descriptions

For each task's `**Node:**` reference, read the `description` field from the node/agent file to get:

- **What the node does** — first paragraph
- `**Input Description:**` — plain language inputs
- `**Output Description:**` — plain language outputs
- `**Input:**` — typed schema (if refined)
- `**Output:**` — typed schema (if refined)

### Task Formats

**Standard task:**
```markdown
### N. Task Name
**Node:** `node-name` (agent|node)
```

Node file contains:
```markdown
<Description>

**Input Description:** what it needs
**Output Description:** what it produces
**Input:** `var1, var2.field, inputs.field` (added by refine-node)
**Output:** `var_name: type` (added by refine-node)
```

**Decision task** (no Node):
```markdown
### N. Decision Name
**Condition:** `expression`
**If true:** continue to task M
**If false:** return:
  - field1: value
  - field2: value
```

**Terminal task** (ends with Return):
```markdown
**Return:**
  - field1: value
  - field2: value
```

---

## Node Resolution

For each task's `**Node:**` reference, determine what it is and where it lives.

### Node Types

| Type | Location | Import Pattern |
|------|----------|----------------|
| `(builtin)` | Built-in nodes from 0pflow | `import { webRead } from "0pflow"` |
| `(node)` | User-defined in `src/nodes/` | `import { nodeName } from "../../src/nodes/<name>.js"` |
| `(agent)` | `agents/<name>.ts` | `import { agentName } from "../../agents/<name>.js"` |

**Note:** Agent imports reference the executable file (`agents/<name>.ts`), not the spec file (`specs/agents/<name>.md`). The executable contains the runtime code that loads the spec.

### Resolution Steps

1. **Parse node reference:** Extract name and type from `**Node:** \`name\` (type)` in the workflow description

2. **For builtin nodes:**
   - Check if it's a built-in node (`web_read`, etc.)
   - Import from `"0pflow"`

3. **For user-defined nodes:**
   - Look for `src/nodes/<name>.ts`
   - Read its `description` field for Input/Output info
   - If missing: ask user to create it (nodes require user implementation)

4. **For agents:**
   - Look for `agents/<name>.ts`
   - Read its `description` field for Input/Output info
   - If missing but task has enough context: create agent stub (see Stub Generation)
   - If missing and context is insufficient: ask clarifying questions

---

## Stub Generation

When an agent is referenced but doesn't exist, generate a stub using the workflow description context.

### Tool Types

There are three types of tools that can be used in agents:

| Type | Description | Import | Example |
|------|-------------|--------|---------|
| **Provider tools** | Tools from AI SDK providers (OpenAI, Anthropic) | `import { createOpenAI } from "@ai-sdk/openai"` | `openai.tools.webSearch()` |
| **Built-in nodes** | Nodes that ship with 0pflow | `import { webRead } from "0pflow"` | `webRead` |
| **User nodes** | Custom nodes implemented in `src/nodes/` | `import { myNode } from "../../src/nodes/my-node.js"` | `myNode` |

### Enriched Node Description (from refine-node)

After refinement, node descriptions include extra fields used to generate the agent executable:

```markdown
<What the agent does.>

**Tools needed:**
  - webRead (builtin)
  - openai.tools.webSearch() (provider)
  - myCustomNode (user node)
**Guidelines:** specific guidelines for the agent

**Input Description:** what it needs
**Input:** `{ field: type }`
**Output Description:** what it produces
**Output:** `var: type`
```

### Agent Stub Template

When creating a new agent, generate TWO files:

1. **Spec file:** `specs/agents/<name>.md` - The agent prompt/config
2. **Executable file:** `agents/<name>.ts` - TypeScript executable that references the spec

#### Spec File (`specs/agents/<name>.md`)

The spec contains only the system prompt and optional model/maxSteps config. **Tools are defined in code, not in the spec.**

```markdown
---
name: <agent-name>
model: openai/gpt-4o  # optional
maxSteps: 10          # optional
---

# <Agent Title>

<First paragraph of task description>

## Task

<Derived from task description and inputs>

## Guidelines

<From **Guidelines:** field, or defaults:>
- Prefer primary sources over aggregators
- If information is unavailable, say so rather than guessing
- Keep output structured and consistent

## Output Format

Return a JSON object with:
<From **Output:** type or parsed from output schema>
```

#### Executable File (`agents/<name>.ts`)

**IMPORTANT:**
- Always use absolute path resolution for `specPath` to ensure the agent works regardless of the current working directory
- Tools are defined as a record in `Agent.create()`, not in the spec file
- **Agents must declare their AI model provider in `integrations`** (e.g. `["openai"]`) so the framework fetches the API key at runtime via `ctx.getConnection()`. Do NOT rely on env vars like `OPENAI_API_KEY`.

```typescript
// agents/<name>.ts
// Agent executable for <name>
import { z } from "zod";
import { Agent, webRead } from "0pflow";               // Built-in nodes
import { createOpenAI } from "@ai-sdk/openai";         // Provider tools
// import { myNode } from "../src/nodes/my-node.js";   // User nodes
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize provider for provider-specific tools (only if using provider tools)
const openai = createOpenAI({});

export const <camelCaseName> = Agent.create({
  name: "<name>",
  integrations: ["openai"],  // REQUIRED: declares which API keys to fetch at runtime (e.g. "openai", "anthropic", "salesforce")
  description: `
<What this agent does.>

**Input Description:** <plain language>
**Output Description:** <plain language>
`,
  inputSchema: z.object({
    // ... from **Input:** type
  }),
  outputSchema: z.object({
    // ... from **Output:** type
  }),
  // Tools from **Tools needed:** - only include what the description specifies
  tools: {
    web_read: webRead,                     // (builtin)
    web_search: openai.tools.webSearch(),  // (provider)
    // my_node: myNode,                    // (user node)
  },
  specPath: path.resolve(__dirname, "../specs/agents/<name>.md"),
});
```

The `path.resolve(__dirname, ...)` pattern ensures the spec file is found relative to the executable file's location, not the current working directory.

#### Generating Tools from Description

The `**Tools needed:**` section in the node description explicitly specifies each tool with its type. Generate imports and tools record directly:

```markdown
**Tools needed:**
  - webRead (builtin)
  - openai.tools.webSearch() (provider)
  - enrichCompany (user node in src/nodes/enrich-company.ts)
```

Generates:

```typescript
import { webRead } from "0pflow";
import { createOpenAI } from "@ai-sdk/openai";
import { enrichCompany } from "../../src/nodes/enrich-company.js";

const openai = createOpenAI({});

// In Agent.create():
tools: {
  web_read: webRead,
  web_search: openai.tools.webSearch(),
  enrich_company: enrichCompany,
},
```

### When Context Is Insufficient

If the node description lacks `**Tools needed:**`, `**Guidelines:**`, or clear output type, ask:

"Task N references `<agent-name>` agent but the description is missing details:
- Tools needed: [missing/present]
- Guidelines: [missing/present]
- Output format: [missing/present]

Would you like me to ask clarifying questions, or should I create a minimal stub with TODOs?"

---

## Handling Ambiguities

When task logic is unclear, ask for clarification before generating code.

### Common Ambiguities

| Pattern | Problem | Ask |
|---------|---------|-----|
| "if good fit" | Undefined criteria | "What's the exact condition? (e.g., score >= 80)" |
| "check if valid" | Undefined validation | "What makes it valid? What fields to check?" |
| Untyped output | Can't generate schema | "What type should `var_name` be?" |
| Missing condition | Decision has no **Condition:** | "What condition determines the branch?" |

### Clarification Flow

1. Identify the ambiguity
2. Ask ONE specific question
3. Wait for user response
4. Update the description field in the workflow or node file with the clarified information
5. Continue compilation

---

## Code Generation

Update the `run()` method in the existing `generated/workflows/<name>.ts` file. Do not regenerate the entire file — preserve the `description`, schemas, and imports, and update only what changed.

### Generated run() Structure

```typescript
async run(ctx, inputs: <Name>Input): Promise<<Name>Output> {
  // Task 1: <Task Name>
  // <task description as comment>
  const <output_var> = await ctx.run(<nodeRef>, { <inputs> });

  // Task 2: <Decision or next task>
  if (<condition>) {
    // ...
  }

  return { <output fields> };
},
```

### Type Mapping

| Spec Type | Zod Schema |
|-----------|------------|
| `string` | `z.string()` |
| `number` | `z.number()` |
| `boolean` | `z.boolean()` |
| `string \| null` | `z.string().nullable()` |
| `"a" \| "b"` | `z.enum(["a", "b"])` |
| `{ x: string, y?: number }` | `z.object({ x: z.string(), y: z.number().optional() })` |
| `string[]` | `z.array(z.string())` |

### Naming Conventions

- Workflow export: `camelCase` (e.g., `urlSummarizer`)
- Schema names: `PascalCase` + Schema/Input/Output (e.g., `UrlSummarizerInputSchema`)
- Type names: `PascalCase` + Input/Output (e.g., `UrlSummarizerInput`)

---

## Compilation Process

Follow these steps in order:

### Step 1: Read Workflow and Node Descriptions

1. Read `generated/workflows/<name>.ts`
2. Extract the `description` field from `Workflow.create()`
3. Parse tasks from the description's `## Tasks` section
4. For each task with a `**Node:**` reference, read the node/agent file and extract its `description` field

### Step 2: Validate Structure

1. Verify tasks have required fields (Node or Condition)
2. Check that referenced node/agent files exist
3. List any missing or ambiguous elements

### Step 3: Resolve All Nodes

For each task with a `**Node:**` reference:
1. Determine node type (agent/node/builtin)
2. Verify node exists or create stub
3. Build import statement

### Step 4: Clarify Ambiguities

If any ambiguities found:
1. Ask ONE question at a time
2. Update the relevant description field with answer
3. Repeat until all ambiguities resolved

### Step 5: Update Code

1. Update imports in the workflow file as needed
2. Regenerate the `run()` method based on descriptions
3. Update schemas if typed **Input:**/**Output:** fields exist in node descriptions

### Step 6: Report Results

Tell user:
1. "Updated `generated/workflows/<name>.ts`"
2. If stubs created: "Created agent stub(s): `agents/<name>.ts` + `specs/agents/<name>.md`"
3. If function nodes missing: "Missing function node(s) that you need to implement: `src/nodes/<name>.ts`"

---

## Compiler Principles

1. **No invention** - Only emit code that directly maps to descriptions
2. **Fail closed** - Missing info → ask, don't guess
3. **Deterministic** - Same descriptions → same output
4. **Readable output** - Generated code should be understandable
5. **Update descriptions** - When clarifying, update the description field so it stays canonical
