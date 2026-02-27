# Compile Workflow Skill Design

**Date:** 2026-01-27
**Status:** Approved
**Phase:** 5 (Compiler)

## Overview

The compile-workflow skill transforms workflow specs (`specs/workflows/*.md`) into executable TypeScript (`generated/workflows/*.ts`). It actively clarifies ambiguities and generates stubs for missing nodes.

## Invocation

```
/crayon:compile-workflow              → Interactive: list specs, user picks
/crayon:compile-workflow url-check    → Compile specific workflow
```

## Process

1. Read spec from `specs/workflows/<name>.md`
2. Parse frontmatter + sections (Inputs, Tasks, Outputs)
3. For each task, resolve node references:
   - If node exists → use it
   - If node missing but spec has enough info → create stub
   - If spec ambiguous → ask clarifying questions, update spec
4. If task logic is ambiguous (e.g., "if good fit") → ask to clarify, update spec
5. Generate TypeScript to `generated/workflows/<name>.ts`
6. Report what was generated/created

## SDK Changes

### Unify tools with `ctx.run()`

Add `"tool"` to `Executable.type` union in `types.ts`:
```typescript
type: "node" | "agent" | "workflow" | "tool"
```

Update `ToolExecutable` in `tools/tool.ts` to extend `Executable`:
```typescript
export interface ToolExecutable<TInput, TOutput>
  extends Executable<TInput, TOutput> {
  readonly type: "tool";
}
```

This allows generated code to use a unified pattern:
```typescript
// Agent call
const companyData = await ctx.run(companyResearcher, { url: inputs.company_url });

// Tool call
const response = await ctx.run(webRead, { url: inputs.url });

// Function node call
const result = await ctx.run(calculateScore, { data: companyData });
```

## Generated Code Format

For a workflow spec, the compiler generates a self-contained TypeScript file with:
- Zod schemas for input/output validation
- TypeScript types inferred from schemas
- Workflow definition using `Workflow.create()`

### Example

Input spec `url-summarizer.md`:
```markdown
---
name: url-summarizer
version: 1
---

# URL Summarizer Workflow

## Inputs
- url: string (required)

## Tasks

### 1. Fetch URL
**Node:** `web_read` (node)
**Input:** url
**Output:** `response: { status: number, title: string | null, content: string | null }`

---

### 2. Check Status
**Condition:** `response.status == 200`
**If true:** continue to task 3
**If false:** return:
  - status: "error"
  - status_code: response.status
  - error: null

---

### 3. Summarize Page
**Node:** `page-summarizer` (agent)
**Input:** response.content
**Output:** `summary: string`
**Return:**
  - status: "success"
  - status_code: response.status
  - summary: summary

## Outputs
- status: "success" | "error"
- status_code: number
- summary: string | null
- error: string | null
```

Generated `url-summarizer.ts`:
```typescript
// generated/workflows/url-summarizer.ts
import { z } from "zod";
import { Workflow } from "crayon";
import { webRead } from "crayon";
import { pageSummarizer } from "../../specs/agents/page-summarizer.js";

// Input schema
const UrlSummarizerInputSchema = z.object({
  url: z.string(),
});
type UrlSummarizerInput = z.infer<typeof UrlSummarizerInputSchema>;

// Output schema
const UrlSummarizerOutputSchema = z.object({
  status: z.enum(["success", "error"]),
  status_code: z.number(),
  summary: z.string().nullable(),
  error: z.string().nullable().optional(),
});
type UrlSummarizerOutput = z.infer<typeof UrlSummarizerOutputSchema>;

export const urlSummarizer = Workflow.create({
  name: "url-summarizer",
  version: 1,
  inputSchema: UrlSummarizerInputSchema,
  outputSchema: UrlSummarizerOutputSchema,

  async run(ctx, inputs: UrlSummarizerInput): Promise<UrlSummarizerOutput> {
    // Task 1: Fetch URL
    const response = await ctx.run(webRead, { url: inputs.url });

    // Task 2: Check Status
    if (response.status !== 200) {
      return {
        status: "error",
        status_code: response.status,
        summary: null,
        error: null,
      };
    }

    // Task 3: Summarize Page
    const summary = await ctx.run(pageSummarizer, { content: response.content ?? "" });

    return {
      status: "success",
      status_code: response.status,
      summary: summary.summary,
      error: null,
    };
  },
});
```

## Stub Generation

When the compiler encounters a missing agent referenced in a task:

**If spec has enough context** (task description + input/output types), generate stub:
```markdown
---
name: page-summarizer
tools: []
---

# Page Summarizer

Generate a 1-paragraph summary of the page content.

## Task

Given page content as input, produce a concise summary.

## Guidelines

- TODO: Add specific guidelines for this agent

## Output Format

Return a JSON object with:
- summary: string
```

**If spec lacks info** (vague description, unclear types):
- Compiler asks clarifying questions
- User provides details
- Compiler updates workflow spec task description
- Then generates meaningful stub

## Spec Parsing Rules

### Required Sections

- **Frontmatter:** `name` (required), `version` (defaults to 1)
- **`## Inputs`** - at least one input
- **`## Tasks`** - at least one task (reject `## Steps`)

### Optional Sections

- **`## Outputs`** - if omitted, workflow returns `void`
- Title/description after frontmatter (for humans, ignored by compiler)

### Task Format

Standard task:
```markdown
### N. Task Name

Description text (human-readable intent).

**Node:** `node-name` (agent|function|tool)
**Input:** var1, var2.field, inputs.field
**Output:** `var_name: type`
```

Decision task (no Node, has Condition):
```markdown
### N. Decision Name

Description.

**Condition:** `expression`
**If true:** continue to task M
**If false:** return:
  - field1: value
  - field2: value
```

Terminal task (has Return instead of Output):
```markdown
**Return:**
  - field1: value
  - field2: value
```

### Type Syntax

- Simple: `string`, `number`, `boolean`
- Union: `"value1" | "value2"`
- Nullable: `string | null`
- Object: `{ field1: type, field2?: type }` (? = optional)
- Array: `string[]` or `{ id: number }[]`

## Implementation Tasks

1. **SDK changes** (`packages/core/src/`):
   - `types.ts` - Add `"tool"` to Executable type union
   - `tools/tool.ts` - Make ToolExecutable extend Executable

2. **Compiler skill** (`skills/compile-workflow/SKILL.md`):
   - Full skill with parsing, generation, stub creation
   - Interactive clarification for ambiguities

3. **Fix existing spec** (`examples/uptime-app/specs/workflows/url-check.md`):
   - Change `## Steps` to `## Tasks`

4. **Update main design doc**:
   - Add post-MVP note about incremental compilation

## Post-MVP

- **Incremental compilation** - Only compile specs that changed since last compilation (diff-based)
