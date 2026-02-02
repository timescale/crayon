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

**Node:** `node-name` (agent|node)
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

## Node Resolution

For each task's `**Node:**` reference, determine what it is and where it lives.

### Node Types

| Type | Location | Import Pattern |
|------|----------|----------------|
| `(builtin)` | Built-in nodes from 0pflow | `import { httpGet } from "0pflow"` |
| `(node)` | User-defined in `src/nodes/` | `import { nodeName } from "../../src/nodes/<name>.js"` |
| `(agent)` | `agents/<name>.ts` | `import { agentName } from "../../agents/<name>.js"` |

**Note:** Agent imports reference the executable file (`agents/<name>.ts`), not the spec file (`specs/agents/<name>.md`). The executable contains the runtime code that loads the spec.

### Resolution Steps

1. **Parse node reference:** Extract name and type from `**Node:** \`name\` (type)`

2. **For builtin nodes:**
   - Check if it's a built-in node (`http_get`, etc.)
   - Import from `"0pflow"`

3. **For user-defined nodes:**
   - Look for `src/nodes/<name>.ts`
   - If missing: ask user to create it (nodes require user implementation)

4. **For agents:**
   - Look for `specs/agents/<name>.md`
   - If missing but task has enough context: create agent stub (see Stub Generation)
   - If missing and context is insufficient: ask clarifying questions

---

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

When creating a new agent, generate TWO files:

1. **Spec file:** `specs/agents/<name>.md` - The agent prompt/config
2. **Executable file:** `agents/<name>.ts` - TypeScript executable that references the spec

#### Spec File (`specs/agents/<name>.md`)

```markdown
---
name: <agent-name>
tools:
  - <from **Tools needed:** - map to tool names like http_get, web_search>
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

#### Executable File (`agents/<name>.ts`)

**IMPORTANT:** Always use absolute path resolution for `specPath` to ensure the agent works regardless of the current working directory (e.g., when running tests).

```typescript
// agents/<name>.ts
// Agent executable for <name>
import { z } from "zod";
import { Agent } from "0pflow";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const <camelCaseName> = Agent.create({
  name: "<name>",
  inputSchema: z.object({
    // ... from task **Input:**
  }),
  outputSchema: z.object({
    // ... from task **Output:** type
  }),
  specPath: path.resolve(__dirname, "../specs/agents/<name>.md"),
});
```

The `path.resolve(__dirname, ...)` pattern ensures the spec file is found relative to the executable file's location, not the current working directory.

### When Context Is Insufficient

If the task lacks `**Tools needed:**`, `**Guidelines:**`, or clear output type, ask:

"Task N references `<agent-name>` agent but the task description is missing details:
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

## Code Generation

Generate TypeScript file at `generated/workflows/<name>.ts`.

### File Structure

```typescript
// generated/workflows/<name>.ts
// Auto-generated by compile-workflow skill - do not edit directly
import { z } from "zod";
import { Workflow } from "0pflow";
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
   - Task 1: `http_get` (node) - built-in ✓
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
