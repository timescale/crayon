# Phase 5: Compile Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the compile-workflow Claude Code skill that transforms workflow specs into executable TypeScript.

**Architecture:** The compiler is a Claude Code skill that parses workflow spec markdown, resolves node references (creating stubs if needed), clarifies ambiguities interactively, and generates TypeScript using the crayon SDK. Tools are unified with the Executable interface so `ctx.run()` works for agents, nodes, and tools.

**Tech Stack:** TypeScript, Zod, vitest, gray-matter (markdown parsing), crayon SDK

---

## Task 0: Update spec-author to Defer Stub Creation

**Files:**
- Modify: `skills/spec-author/SKILL.md`

**Step 1: Remove stub creation from spec-author**

The spec-author skill should no longer create agent stubs. Instead, it should:
- Note which new agents are needed
- Tell user that compile-workflow will create the stubs

This change has already been made to the skill file.

**Step 2: Commit**

```bash
git add skills/spec-author/SKILL.md
git commit -m "refactor(skills): move agent stub creation from spec-author to compile-workflow

Spec-author now only identifies new agents needed; compile-workflow
creates the stubs during compilation. Single responsibility."
```

---

## Task 1: Unify ToolExecutable with Executable Interface

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/tools/tool.ts`
- Modify: `packages/core/src/nodes/agent/executor.ts`
- Modify: `packages/core/src/agent.ts`
- Modify: `packages/core/src/__tests__/context.test.ts`
- Modify: `packages/core/src/__tests__/agent.e2e.test.ts`

**Step 1: Update Executable type union**

In `packages/core/src/types.ts`, add `"tool"` to the type union:

```typescript
export interface Executable<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly type: "node" | "agent" | "workflow" | "tool";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}
```

**Step 2: Update ToolExecutable to match Executable signature**

In `packages/core/src/tools/tool.ts`, the execute signature needs to accept `ctx` (even if unused) to match Executable:

```typescript
export interface ToolExecutable<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly type: "tool";
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}
```

Update `Tool.create()` to match:

```typescript
export const Tool = {
  create<TInput, TOutput>(
    definition: ToolDefinition<TInput, TOutput>
  ): ToolExecutable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "tool",
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: async (_ctx: WorkflowContext, inputs: TInput): Promise<TOutput> => {
        // Validate inputs
        const validated = definition.inputSchema.parse(inputs);
        return definition.execute(validated);
      },
    };
  },
};
```

Add import at top of file:
```typescript
import type { WorkflowContext } from "../types.js";
```

**Step 3: Update agent executor to pass ctx to tools**

In `packages/core/src/nodes/agent/executor.ts`:

1. Add `WorkflowContext` to imports:
```typescript
import type { WorkflowContext } from "../../types.js";
```

2. Update `convertToAITool` to accept and pass ctx:
```typescript
function convertToAITool(toolExecutable: AnyToolExecutable, ctx: WorkflowContext) {
  return tool({
    description: toolExecutable.description,
    inputSchema: toolExecutable.inputSchema,
    execute: async (args: unknown) => {
      const result = await toolExecutable.execute(ctx, args);
      return result;
    },
  });
}
```

3. Add `ctx` to `ExecuteAgentOptions`:
```typescript
export interface ExecuteAgentOptions<TOutput = unknown> {
  /** Workflow context for tool execution */
  ctx: WorkflowContext;
  /** Parsed agent spec */
  spec: AgentSpec;
  // ... rest unchanged
}
```

4. Update tool resolution in `executeAgent` to pass ctx:
```typescript
const { ctx, spec, userMessage, ... } = options;

// Resolve tools from registry
const tools: ToolSet = {};
if (spec.tools.length > 0) {
  const resolvedTools = toolRegistry.getTools(spec.tools);
  for (const t of resolvedTools) {
    tools[t.name] = convertToAITool(t, ctx);
  }
}
```

**Step 4: Update Agent.execute to pass ctx**

In `packages/core/src/agent.ts`, update the execute function to pass ctx:

```typescript
execute: async (ctx: WorkflowContext, inputs: TInput): Promise<TOutput> => {
  if (!agentRuntimeConfig) {
    throw new Error(
      "Agent runtime not configured. Make sure to use createCrayon() before executing agents."
    );
  }

  // Parse the agent spec
  const spec = await parseAgentSpec(definition.specPath);

  // Convert inputs to a user message string
  const userMessage =
    typeof inputs === "string" ? inputs : JSON.stringify(inputs, null, 2);

  // Execute the agent, passing ctx for tool execution
  const result = await executeAgent({
    ctx,
    spec,
    userMessage,
    toolRegistry: agentRuntimeConfig.toolRegistry,
    modelConfig: agentRuntimeConfig.modelConfig,
    outputSchema: definition.outputSchema,
  });

  return result.output as TOutput;
},
```

**Step 5: Update agent e2e test to pass ctx**

In `packages/core/src/__tests__/agent.e2e.test.ts`, add ctx to both executeAgent calls:

```typescript
import { createWorkflowContext } from "../context.js";

// In each test, create a context and pass it:
const ctx = createWorkflowContext();

const result = await executeAgent({
  ctx,
  spec,
  userMessage: "...",
  toolRegistry,
  // ... rest unchanged
});
```

**Step 6: Add test for ctx.run() with tool**

In `packages/core/src/__tests__/context.test.ts`, add test:

```typescript
import { Tool } from "../tools/tool.js";

// ... existing tests ...

it("ctx.run() works with tools", async () => {
  const tool = Tool.create({
    name: "add",
    description: "Adds two numbers",
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => a + b,
  });

  const ctx = createWorkflowContext();
  const result = await ctx.run(tool, { a: 2, b: 3 });

  expect(result).toBe(5);
});
```

**Step 7: Run tests**

```bash
cd packages/core && pnpm test
```

Expected: All tests pass

**Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/tools/tool.ts packages/core/src/nodes/agent/executor.ts packages/core/src/agent.ts packages/core/src/__tests__/context.test.ts packages/core/src/__tests__/agent.e2e.test.ts
git commit -m "feat(core): unify ToolExecutable with Executable interface

- Tools now have execute(ctx, inputs) signature matching Executable
- Agent executor passes ctx to tools when calling them
- Allows ctx.run(tool, inputs) in workflows"
```

---

## Task 2: Fix url-check.md Spec

**Files:**
- Modify: `examples/uptime-app/specs/workflows/url-check.md`

**Step 1: Change `## Steps` to `## Tasks`**

Replace `## Steps` with `## Tasks` in the file.

**Step 2: Commit**

```bash
git add examples/uptime-app/specs/workflows/url-check.md
git commit -m "fix(specs): rename Steps to Tasks in url-check workflow"
```

---

## Task 3: Write Compile Workflow Skill - Core Structure

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Write the skill header and overview**

The skill needs:
- Frontmatter (name, description)
- Announcement at start
- Pre-flight checks (verify directories exist)
- Interactive workflow selection if no name given

```markdown
---
name: compile-workflow
description: Compile workflow specs from markdown to TypeScript. Use this after creating or modifying workflow specs.
---

# Compile Workflow

Compiles workflow specifications from `specs/workflows/*.md` into executable TypeScript in `generated/workflows/*.ts`.

**Announce at start:** "I'm using the compile-workflow skill to generate TypeScript from the workflow spec."

---

## Pre-Flight Checks

1. **Verify directories exist:**
   - `specs/workflows/` must exist with at least one `.md` file
   - Create `generated/workflows/` if it doesn't exist

2. **If no workflow name provided:**
   - List all specs in `specs/workflows/`
   - Ask user to select which one to compile

3. **If workflow name provided:**
   - Verify `specs/workflows/<name>.md` exists
   - If not, list available specs and ask user to choose

---
```

**Step 2: Commit partial skill**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): add compile-workflow skill structure"
```

---

## Task 4: Write Compile Workflow Skill - Spec Parsing Rules

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Add parsing rules section**

```markdown
## Spec Parsing

### Required Sections

- **Frontmatter:** `name` (required), `version` (defaults to 1)
- **`## Inputs`** - at least one input parameter
- **`## Tasks`** - at least one task (reject `## Steps` - tell user to rename)

### Optional Sections

- **`## Outputs`** - if omitted, workflow returns `void`
- Title and description after frontmatter (for humans, ignored by compiler)

### Input Syntax

```
- param_name: type (required|optional, defaults to X) - Description
```

Types:
- Simple: `string`, `number`, `boolean`
- Union: `"value1" | "value2"`
- Nullable: `string | null`
- Object: `{ field1: type, field2?: type }` (? = optional)
- Array: `string[]` or `{ id: number }[]`

### Task Formats

**Standard task:**
```markdown
### N. Task Name

Description of what this task does.

**Node:** `node-name` (agent|function|tool)
**Input:** var1, var2.field, inputs.field
**Output:** `var_name: type`
```

**Decision task** (no Node):
```markdown
### N. Decision Name

Description.

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
```

**Step 2: Commit**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): add spec parsing rules to compile-workflow"
```

---

## Task 5: Write Compile Workflow Skill - Node Resolution

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Add node resolution section**

```markdown
## Node Resolution

For each task's `**Node:**` reference, determine what it is and where it lives.

### Node Types

| Type | Location | Import Pattern |
|------|----------|----------------|
| `(tool)` | Built-in or `src/tools/` | `import { toolName } from "crayon/tools"` or `import { toolName } from "../../src/tools/..."` |
| `(agent)` | `specs/agents/<name>.md` | Generate agent executable import |
| `(function)` | `src/nodes/<name>.ts` | `import { nodeName } from "../../src/nodes/..."` |

### Resolution Steps

1. **Parse node reference:** Extract name and type from `**Node:** \`name\` (type)`

2. **For tools:**
   - Check if it's a built-in tool (`web_read`)
   - Otherwise look for `src/tools/<name>.ts`
   - If missing: ask user if they want to create a stub

3. **For agents:**
   - Look for `specs/agents/<name>.md`
   - If missing but task has enough context: create agent stub (see Stub Generation)
   - If missing and context is insufficient: ask clarifying questions

4. **For functions:**
   - Look for `src/nodes/<name>.ts`
   - If missing: ask user to create it (functions require user implementation)

---
```

**Step 2: Commit**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): add node resolution rules to compile-workflow"
```

---

## Task 6: Write Compile Workflow Skill - Stub Generation

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Add stub generation section**

```markdown
## Stub Generation

When an agent is referenced but doesn't exist, generate a stub using the enriched task description.

### Enriched Task Format (from spec-author)

Tasks for new agents include extra fields:

```markdown
### N. Task Name

Description of what the agent does.

**Tools needed:** list of tools/capabilities
**Guidelines:** specific guidelines for the agent
**Output fields:** field names and types

**Node:** `agent-name` (agent)
**Input:** ...
**Output:** `var: type`
```

### Agent Stub Template

Extract info from the enriched task description:

```markdown
---
name: <agent-name>
tools:
  - <from **Tools needed:** - map to tool names like web_read, web_search>
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
<From **Output fields:** or parsed from **Output:** type>
```

### When Context Is Insufficient

If the task lacks `**Tools needed:**`, `**Guidelines:**`, or clear output type, ask:

"Task N references `<agent-name>` agent but the task description is missing details:
- Tools needed: [missing/present]
- Guidelines: [missing/present]
- Output format: [missing/present]

Would you like me to ask clarifying questions, or should I create a minimal stub with TODOs?"

---
```

**Step 2: Commit**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): add stub generation to compile-workflow"
```

---

## Task 7: Write Compile Workflow Skill - Ambiguity Handling

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Add ambiguity handling section**

```markdown
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
4. Update the spec file with the clarified information
5. Continue compilation

### Example

Spec says:
```markdown
### 3. Check Quality
See if the data is good enough.
**Condition:** ???
```

Ask:
"Task 3 'Check Quality' needs a concrete condition. What makes data 'good enough'?
- A) A specific field value (e.g., `data.score >= 80`)
- B) Presence of required fields
- C) Other criteria (please describe)"

After user answers, update the spec:
```markdown
### 3. Check Quality
Verify the data meets minimum quality threshold.
**Condition:** `data.score >= 80`
```

---
```

**Step 2: Commit**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): add ambiguity handling to compile-workflow"
```

---

## Task 8: Write Compile Workflow Skill - Code Generation

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Add code generation section**

```markdown
## Code Generation

Generate TypeScript file at `generated/workflows/<name>.ts`.

### File Structure

```typescript
// generated/workflows/<name>.ts
// Auto-generated by compile-workflow skill - do not edit directly
import { z } from "zod";
import { Workflow } from "runcrayon";
// ... node/tool imports ...

// Input schema
const <Name>InputSchema = z.object({
  // ... from ## Inputs
});
type <Name>Input = z.infer<typeof <Name>InputSchema>;

// Output schema (if ## Outputs exists)
const <Name>OutputSchema = z.object({
  // ... from ## Outputs
});
type <Name>Output = z.infer<typeof <Name>OutputSchema>;

export const <camelCaseName> = Workflow.create({
  name: "<kebab-case-name>",
  version: <version>,
  inputSchema: <Name>InputSchema,
  outputSchema: <Name>OutputSchema, // omit if no outputs

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
});
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
```

**Step 2: Commit**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): add code generation template to compile-workflow"
```

---

## Task 9: Write Compile Workflow Skill - Complete Process

**Files:**
- Modify: `skills/compile-workflow/SKILL.md`

**Step 1: Add the main process section that ties it all together**

```markdown
## Compilation Process

Follow these steps in order:

### Step 1: Read and Parse Spec

1. Read `specs/workflows/<name>.md`
2. Parse frontmatter with gray-matter (name, version)
3. Extract sections: Inputs, Tasks, Outputs (optional)
4. If `## Steps` found instead of `## Tasks`, stop and ask user to rename it

### Step 2: Validate Structure

1. Verify required sections exist
2. Check all tasks have required fields (Node or Condition)
3. List any missing or ambiguous elements

### Step 3: Resolve All Nodes

For each task with a `**Node:**` reference:
1. Determine node type (agent/function/tool)
2. Verify node exists or create stub
3. Build import statement

### Step 4: Clarify Ambiguities

If any ambiguities found:
1. Ask ONE question at a time
2. Update spec with answer
3. Repeat until all ambiguities resolved

### Step 5: Generate Code

1. Create `generated/workflows/` directory if needed
2. Generate TypeScript file
3. Write to `generated/workflows/<name>.ts`

### Step 6: Report Results

Tell user:
1. "Generated `generated/workflows/<name>.ts`"
2. If stubs created: "Created agent stub(s): `specs/agents/<name>.md`"
3. If function nodes missing: "Missing function node(s) that you need to implement: `src/nodes/<name>.ts`"

---

## Example Compilation

**Input:** `specs/workflows/url-summarizer.md`

**Process:**
1. Parse spec - found: name=url-summarizer, version=1, 1 input, 3 tasks, 4 outputs
2. Resolve nodes:
   - Task 1: `web_read` (tool) - built-in ✓
   - Task 2: Decision - no node needed
   - Task 3: `page-summarizer` (agent) - check specs/agents/... found ✓
3. No ambiguities
4. Generate code

**Output:** `generated/workflows/url-summarizer.ts`

---

## Compiler Principles

1. **No invention** - Only emit code that directly maps to spec
2. **Fail closed** - Missing info → ask, don't guess
3. **Deterministic** - Same spec → same output
4. **Readable output** - Generated code should be understandable
5. **Update specs** - When clarifying, update the spec file so it stays canonical
```

**Step 2: Commit**

```bash
git add skills/compile-workflow/SKILL.md
git commit -m "feat(skills): complete compile-workflow skill implementation"
```

---

## Task 10: Test Compilation with url-summarizer

**Files:**
- Create: `examples/uptime-app/generated/workflows/url-summarizer.ts`

**Step 1: Run the skill manually**

Invoke `/crayon:compile-workflow url-summarizer` in the uptime-app context and verify:
1. Skill reads the spec correctly
2. Resolves `web_read` tool and `page-summarizer` agent
3. Generates valid TypeScript

**Step 2: Verify generated code compiles**

```bash
cd examples/uptime-app && pnpm tsc --noEmit
```

Expected: No TypeScript errors

**Step 3: Commit generated file**

```bash
git add examples/uptime-app/generated/workflows/url-summarizer.ts
git commit -m "feat(examples): add compiled url-summarizer workflow"
```

---

## Task 11: Test Compilation with url-check

**Files:**
- Create: `examples/uptime-app/generated/workflows/url-check.ts`

**Step 1: Run the skill**

Invoke `/crayon:compile-workflow url-check` and verify:
1. Spec parses correctly (now uses Tasks)
2. `http-head` function node is flagged as missing
3. Skill reports that user needs to create `src/nodes/http-head.ts`

**Step 2: Create minimal function node stub**

Create `examples/uptime-app/src/nodes/http-head.ts`:

```typescript
import { z } from "zod";
import { Node } from "runcrayon";

export const httpHead = Node.create({
  name: "http-head",
  inputSchema: z.object({
    url: z.string(),
    timeout_ms: z.number().optional().default(5000),
  }),
  execute: async (_ctx, inputs) => {
    // TODO: Implement actual HTTP HEAD request
    const start = Date.now();
    return {
      status_code: 200,
      response_time_ms: Date.now() - start,
      error: null,
      checked_at: new Date().toISOString(),
    };
  },
});
```

**Step 3: Re-run compilation and commit**

```bash
git add examples/uptime-app/generated/workflows/url-check.ts examples/uptime-app/src/nodes/http-head.ts
git commit -m "feat(examples): add compiled url-check workflow with http-head node stub"
```

---

## Summary

After completing all tasks:

1. ✅ SDK supports `ctx.run(tool, inputs)` via unified Executable interface
2. ✅ `url-check.md` uses `## Tasks` (not `## Steps`)
3. ✅ `compile-workflow` skill fully implemented with:
   - Interactive spec selection
   - Spec parsing rules
   - Node resolution
   - Stub generation for agents
   - Ambiguity clarification
   - TypeScript code generation
4. ✅ Both example workflows compiled and working
