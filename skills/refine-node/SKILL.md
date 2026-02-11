---
name: refine-node
description: Refine node definitions - determines HOW each node is implemented (SDKs, libraries, input/output structures, tools, guidelines).
---

# Refine Node

Refine node definitions in existing node and agent files. While create-workflow determines **WHAT** each node does, this phase determines **HOW**:

- **Input/Output structures** - Exact typed schemas (field names, types)
- **Implementation approach** - Which SDKs, libraries, or APIs to use
- **Tools** - For agent nodes, which tools they need
- **Guidelines** - Behavioral guidelines for agent nodes

---

## Usage

```
/0pflow:refine-node <workflow-name>
/0pflow:refine-node <workflow-name> <node-name>
```

- With just workflow name: refines all unrefined nodes in the workflow
- With node name: refines only that specific node

---

## Process

### Step 1: Load and Assess

Read `generated/workflows/<workflow-name>.ts` and parse its `description` field to find all task nodes. Then read each referenced node/agent file and check its `description` field.

A node **needs refinement** if its `description` has `**Input Description:**` / `**Output Description:**` (plain language) but is missing typed `**Input:**` / `**Output:**` fields, and its `inputSchema` / `outputSchema` are empty `z.object({})`.

### Step 2: Research Implementation Approaches

Before drafting, gather the information needed:

1. **For nodes that interact with external systems** (Salesforce, HubSpot, Slack, etc.):
   - Invoke `/0pflow:integrations` to determine which SDK/library/API to use
   - For listed integrations: read the specific file (e.g., `salesforce.md`)
   - For unlisted systems: read `unlisted.md` and research the best option
   - **CRITICAL — Connection Gate:** Call `get_connection_info` for each integration the node needs. **If the call fails** (no connection configured), you MUST stop immediately. Do NOT create SDK files, client code, integration directories, or any implementation that depends on a live connection. Tell the user which connections are missing and ask them to set them up in the Dev UI, then say "continue" when ready.

2. **For agent nodes**, check AI SDK provider docs for available tools:
   - **OpenAI:** https://ai-sdk.dev/providers/ai-sdk-providers/openai
   - **Anthropic:** https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
   - Use `WebFetch` to read these pages for provider tool options
   - **IMPORTANT:** When an agent uses a provider (OpenAI, Anthropic, etc.), declare it in `integrations: ["openai"]` so the framework fetches the API key from Nango at runtime. Do NOT rely on env vars like `OPENAI_API_KEY`. The agent executor automatically detects the model provider in the integrations list and calls `ctx.getConnection()` to get the key.

3. **For simple compute nodes**: determine if any libraries are needed

### Step 3: Draft All Refinements

Draft the complete refined definition for **every node that needs it**, then update all files at once.

For each node, determine:

- **Implementation approach** — SDK, library, or "pure TypeScript"
- **Typed input schema** — derived from the Input Description
- **Typed output schema** — derived from the Output Description
- **Tools** (agent nodes only) — selected from the three categories below
- **Guidelines** (agent nodes only) — behavioral rules, preferred sources, edge case handling

Use your judgment to propose reasonable schemas and tool selections based on the descriptions. The user can correct anything after.

### Tool Categories (Agent Nodes)

| Category | Description | Examples |
|----------|-------------|---------|
| **Built-in nodes** | Ships with 0pflow | `webRead` |
| **Provider tools** | From AI SDK providers | `openai.tools.webSearch()`, `openai.tools.codeInterpreter()` |
| **User nodes** | Custom nodes in `src/nodes/` | `enrichCompany`, `sendSlackMessage` |

Common mappings:

| Need | Tool | Category |
|------|------|----------|
| Fetch web pages | `webRead` | builtin |
| Search the web | `openai.tools.webSearch()` | provider |
| Run Python code | `openai.tools.codeInterpreter()` | provider |
| Domain-specific (CRM, email) | User must implement | user node |

### What to Update in Node Files

For each node/agent file (`src/nodes/<name>.ts` or `agents/<name>.ts`), update:

1. **The `description` field** — add typed schemas and (for agents) tools/guidelines:

**Refined node description:**
```markdown
<Expanded description>

**Implementation:** <SDK, library, or approach>

**Input Description:** <original from create-workflow>
**Input:** `{ field: type, field2: type }`
**Output Description:** <original from create-workflow>
**Output:** `var_name: { field: type, field2?: type }`
```

**Refined agent description:**
```markdown
<Expanded description>

**Implementation:** <SDK, library, or approach>
**Tools needed:**
  - webRead (builtin)
  - openai.tools.webSearch() (provider)
  - myCustomNode (user node in src/nodes/my-custom-node.ts)
**Guidelines:** <specific guidelines>

**Input Description:** <original from create-workflow>
**Input:** `{ field: type, field2: type }`
**Output Description:** <original from create-workflow>
**Output:** `var_name: { field: type, field2?: type }`
```

2. **The `inputSchema` and `outputSchema`** — replace empty `z.object({})` with proper Zod types

3. **For agents: the `integrations` array** — add the model provider (e.g. `"openai"`, `"anthropic"`) and any external services the agent needs. This is how the framework knows to fetch API keys from Nango at runtime.

4. **For agents: the `tools` record** — add tool imports and entries based on `**Tools needed:**`

5. **For agents: the spec file** (`specs/agents/<name>.md`) — update guidelines and output format sections

### Type Syntax

- Simple: `string`, `number`, `boolean`
- Objects: `{ field1: string, field2?: number }` (? = optional)
- Arrays: `string[]` or `{ name: string }[]`
- Nullable: `string | null`

### Step 4: Write and Continue

After writing all refinements:

- Tell the user the node files have been updated
- Invoke `/0pflow:compile-workflow` to regenerate the workflow's `run()` method with proper types

---

## Principles

1. **Draft first, ask later** — propose complete schemas based on descriptions; let the user correct rather than interrogating
2. **Preserve descriptions** — keep the original Input/Output Description fields alongside the new typed schemas
3. **Concrete types** — every field needs a type; no `any` or untyped fields
4. **Research before guessing** — check integration skills and provider docs before selecting tools/SDKs
