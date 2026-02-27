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
   - If no `.ts` files found, tell user to run `/crayon:create-workflow` first

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
| `(builtin)` | Built-in nodes from crayon | `import { webRead } from "crayon"` |
| `(node)` | User-defined in `src/nodes/` or `nodes/` | `import { nodeName } from "../../src/nodes/<name>"` |
| `(agent)` | `agents/<name>.ts` | `import { agentName } from "../../agents/<name>"` |

**Note:** Agent imports reference the executable file (`agents/<name>.ts`), not the spec file (`specs/agents/<name>.md`). The executable contains the runtime code that loads the spec.

**IMPORTANT:** Never use `.js` extensions in import paths. Use extensionless imports (e.g., `"../../nodes/check-website"` not `"../../nodes/check-website.js"`). Turbopack cannot resolve `.js` → `.ts` in production builds.

### Resolution Steps

1. **Parse node reference:** Extract name and type from `**Node:** \`name\` (type)` in the workflow description

2. **For builtin nodes:**
   - Check if it's a built-in node (`web_read`, etc.)
   - Import from `"crayon"`

3. **For user-defined nodes:**
   - Look for `src/nodes/<name>.ts`
   - Read its `description` field and `inputSchema`/`outputSchema` for type info
   - If missing: create it using the stub templates from `/crayon:create-workflow`

4. **For agents:**
   - Look for `agents/<name>.ts`
   - Read its `description` field and `inputSchema`/`outputSchema` for type info
   - If missing: create it using the stub templates from `/crayon:create-workflow`

### Updating Agent Tools from Description

When an agent's description contains a `**Tools needed:**` section (added by `/crayon:refine-node`), update the agent's `tools` record and imports to match. Use the tool type to determine the import pattern:

| Tool Type | Import Pattern | tools record entry |
|-----------|----------------|--------------------|
| `(builtin)` | `import { webRead } from "crayon"` | `web_read: webRead` |
| `(provider)` | `import { createOpenAI } from "@ai-sdk/openai"; const openai = createOpenAI();` | `web_search: openai.tools.webSearch()` |
| `(user node in src/nodes/<file>.ts)` | `import { name } from "../../src/nodes/<file>"` | `enrich_company: enrichCompany` |

---

## Handling Ambiguities

When task logic is unclear, make your best guess and generate the code. The user can correct after. Don't block on questions.

### Common Ambiguities and Defaults

| Pattern | Problem | Default |
|---------|---------|---------|
| "if good fit" | Undefined criteria | Use `score >= 80` and add a comment noting the threshold is a guess |
| "check if valid" | Undefined validation | Check for presence of required fields |
| Untyped output | Can't generate schema | Infer from node description and context |
| Missing condition | Decision has no **Condition:** | Infer from surrounding task context, add a TODO comment if truly unknowable |

After generating code, tell the user what you assumed so they can correct anything.

---

## Code Generation

Rewrite the `run()` method in the existing `generated/workflows/<name>.ts` file. Also update imports and schemas as needed. Preserve the `description` field as-is.

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

### Naming Conventions

- Workflow export: `camelCase` (e.g., `urlSummarizer`)
- Schema names: `PascalCase` + Schema/Input/Output (e.g., `UrlSummarizerInputSchema`)
- Type names: `PascalCase` + Input/Output (e.g., `UrlSummarizerInput`)

---

## Worked Example

A workflow enriches Gmail leads and sends results to Slack. Here's how the compiler turns descriptions into the `run()` method.

### Input: Workflow description

```markdown
Enrich the 10 most recent Gmail leads from Salesforce with web research and DM results on Slack.

## Tasks

### 1. Fetch Gmail Leads
**Node:** `fetch-gmail-leads` (node)

### 2. Enrich Lead
**Node:** `enrich-lead` (agent)
**Loop:** for each lead in leads

### 3. Send Slack DM
**Node:** `send-slack-dm` (node)
```

### Input: Node schemas (from refined node files)

- **fetch-gmail-leads** — `inputSchema: z.object({})`, `outputSchema: z.object({ leads: z.array(LeadSchema) })`
- **enrich-lead** — `inputSchema: z.object({ name: z.string(), email: z.string(), company: z.string().nullable(), title: z.string().nullable() })`, `outputSchema: z.object({ name: z.string(), email: z.string(), linkedinUrl: z.string().nullable(), ... })`
- **send-slack-dm** — `inputSchema: z.object({ enrichedLeads: z.array(EnrichedLeadSchema) })`, `outputSchema: z.object({ success: z.boolean(), channel: z.string() })`

### Output: Generated run() method

```typescript
async run(ctx, inputs: LeadEnrichmentInput): Promise<LeadEnrichmentOutput> {
  // Task 1: Fetch the 10 most recent Gmail leads from Salesforce
  const leadsResult = await ctx.run(fetchGmailLeads, {});

  // Task 2: Enrich each lead with web research
  const enrichedLeads = [];
  for (const lead of leadsResult.leads) {
    const enriched = await ctx.run(enrichLead, {
      name: lead.name ?? "",
      email: lead.email ?? "",
      company: lead.company,
      title: lead.title,
    });
    enrichedLeads.push(enriched);
  }

  // Task 3: Send enriched lead summary as Slack DM
  const slackResult = await ctx.run(sendSlackDm, { enrichedLeads });

  return { success: slackResult.success, channel: slackResult.channel };
},
```

Key things the compiler did:
1. **Data flow** — wired `leadsResult.leads` fields into `enrichLead`'s input schema, and `enrichedLeads` array into `sendSlackDm`'s input
2. **Loop** — translated `**Loop:** for each lead in leads` into a `for...of` loop over `leadsResult.leads`
3. **Schema alignment** — matched field names from output schemas to input schemas (e.g., `lead.name` → `name`, `lead.company` → `company`)

### After Compilation

Tell the user:
1. "Updated `generated/workflows/<name>.ts`"
2. If any missing nodes/agents were created: list the new files
3. If agent tools were updated from descriptions: list which agents were updated

---

## Compiler Principles

1. **Draft first, ask later** — make your best guess and let the user correct, rather than blocking on questions
2. **No invention** — only emit code that maps to descriptions; guesses should be flagged with comments
3. **Deterministic** — same descriptions → same output
4. **Readable output** — generated code should be understandable
5. **Update descriptions** — when clarifying, update the description field so it stays canonical
