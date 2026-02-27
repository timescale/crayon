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
/crayon:refine-node <workflow-name>
/crayon:refine-node <workflow-name> <node-name>
```

- With just workflow name: refines all unrefined nodes in the workflow
- With node name: refines only that specific node

---

## Process

### Step 1: Load and Assess

Read `src/crayon/workflows/<workflow-name>.ts` and parse its `description` field to find all task nodes. Then read each referenced node/agent file and check its `description` field.

A node **needs refinement** if its `inputSchema` / `outputSchema` are still empty `z.object({})`.

### Step 2: Research Implementation Approaches

Before drafting, gather the information needed:

1. **For nodes that interact with external systems** (Salesforce, HubSpot, Slack, etc.):
   - Invoke `/crayon:integrations` to determine which SDK/library/API to use
   - For listed integrations: read the specific file (e.g., `salesforce.md`)
   - For unlisted systems: read `unlisted.md` and research the best option
   - **CRITICAL — Connection Gate:** Call `get_connection_info` for each integration the node needs. **If the call fails** (no connection configured), you MUST stop immediately. Do NOT create SDK files, client code, integration directories, or any implementation that depends on a live connection. Tell the user which connections are missing and ask them to set them up via the Credentials page in the Dev UI sidebar (in a cloud sandbox, this is the browser tab they already have open). Then say "continue" when ready.

2. **For agent nodes**, check AI SDK provider docs for available tools:
   - **OpenAI:** https://ai-sdk.dev/providers/ai-sdk-providers/openai
   - **Anthropic:** https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
   - Use `WebFetch` to read these pages for provider tool options
   - **IMPORTANT:** When an agent uses a provider (OpenAI, Anthropic, etc.), declare it in `integrations: ["openai"]` so the framework fetches the API key at runtime via `ctx.getConnection()`. Do NOT rely on env vars like `OPENAI_API_KEY`. The agent executor automatically detects the model provider in the integrations list and calls `ctx.getConnection()` to get the key.

3. **For simple compute nodes**: determine if any libraries are needed

### Step 3: Draft All Refinements

Draft the complete refined definition for **every node that needs it**, then update all files at once.

For each node, determine:

- **Implementation approach** — SDK, library, or "pure TypeScript"
- **Zod input schema** — derived from the Input Description
- **Zod output schema** — derived from the Output Description
- **Tools** (agent nodes only) — selected from the three categories below
- **Guidelines** (agent nodes only) — behavioral rules, preferred sources, edge case handling

Use your judgment to propose reasonable schemas and tool selections based on the descriptions. The user can correct anything after.

### Tool Categories (Agent Nodes)

| Category | Description | Examples |
|----------|-------------|---------|
| **Built-in nodes** | Ships with crayon | `webRead` |
| **Provider tools** | From AI SDK providers (see import below) | `openai.tools.webSearch()`, `openai.tools.codeInterpreter()` |
| **User nodes** | Custom nodes in `src/crayon/nodes/` | `enrichCompany`, `sendSlackMessage` |

Common mappings:

| Need | Tool | Category |
|------|------|----------|
| Fetch web pages | `webRead` | builtin |
| Search the web | `openai.tools.webSearch()` | provider |
| Run Python code | `openai.tools.codeInterpreter()` | provider |
| Domain-specific (CRM, email) | User must implement | user node |

**Provider tool imports:** Provider tools require creating a provider instance from `@ai-sdk/openai` (NOT from `crayon` or `openai`):
```typescript
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI();
// Then use: openai.tools.webSearch(), openai.tools.codeInterpreter(), etc.
```

### What to Update in Node Files

For each node/agent file (`src/crayon/nodes/<name>.ts` or `src/crayon/agents/<name>.ts`), update:

1. **The `description` field** — add typed schemas and (for agents) tools/guidelines:

**Refined node description:**
```markdown
<Expanded description>

**Implementation:** <SDK, library, or approach>

**Input Description:** <original from create-workflow>
**Output Description:** <original from create-workflow>
```

**Refined agent description:**
```markdown
<Expanded description>

**Implementation:** <SDK, library, or approach>
**Tools needed:**
  - webRead (builtin)
  - openai.tools.webSearch() (provider)
  - myCustomNode (user node in src/crayon/nodes/my-custom-node.ts)
**Guidelines:** <specific guidelines>

**Input Description:** <original from create-workflow>
**Output Description:** <original from create-workflow>
```

2. **The `inputSchema` and `outputSchema`** — replace empty `z.object({})` with proper Zod types

3. **For agents: the `integrations` array** — add the model provider (e.g. `"openai"`, `"anthropic"`) and any external services the agent needs. This is how the framework knows to fetch API keys at runtime via `ctx.getConnection()`.

4. **For agents: the `tools` record** — add tool imports and entries based on `**Tools needed:**`

5. **For agents: the spec file** (`src/crayon/agents/<name>.md`) — update guidelines, output format sections, and optionally add `model` and `maxSteps` to the YAML frontmatter:
   - `model: openai/gpt-4o` — override the default model (use when a specific model is needed, e.g. cheaper model for simple tasks, stronger model for complex reasoning)
   - `maxSteps: 10` — max tool-call iterations (increase for agents that need many sequential tool calls, decrease for simple single-shot agents)

### Step 4: Write and Continue

After writing all refinements:

- Tell the user the node files have been updated
- Invoke `/crayon:compile-workflow` to regenerate the workflow's `run()` method with proper types

---

## Worked Example

A workflow has an `enrich-lead` agent with empty schemas from create-workflow:

**Before** (`src/crayon/agents/enrich-lead.ts`):
```typescript
export const enrichLead = Agent.create({
  name: "enrich-lead",
  integrations: ["openai"],
  description: `
Searches the web to find additional professional info about a lead.

**Input Description:** A lead's name, email, and any known company or title from Salesforce.
**Output Description:** Enriched lead info including LinkedIn URL, company, job title, and summary.
`,
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  tools: {},
  specPath: path.resolve(__dirname, "./enrich-lead.md"),
});
```

**After refinement** — schemas filled, description enriched, tools added:
```typescript
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI();

export const enrichLead = Agent.create({
  name: "enrich-lead",
  integrations: ["openai"],
  description: `
Given a lead's name, email, and any existing Salesforce fields, searches the web to find
additional information: LinkedIn profile URL, current company, job title, and other
relevant professional details.

**Implementation:** OpenAI GPT-4o with web search tool
**Tools needed:**
  - openai.tools.webSearch() (provider)
**Guidelines:** Search by name + email domain or company. Prioritize LinkedIn as primary source. Do not fabricate URLs.

**Input Description:** A lead's name, email, and any known company or title from Salesforce.
**Output Description:** Enriched lead info including LinkedIn URL, company, job title, and summary.
`,
  inputSchema: z.object({
    name: z.string().describe("Lead's full name"),
    email: z.string().describe("Lead's email address"),
    company: z.string().nullable().describe("Company from Salesforce, if known"),
    title: z.string().nullable().describe("Title from Salesforce, if known"),
  }),
  outputSchema: z.object({
    name: z.string(),
    email: z.string(),
    linkedinUrl: z.string().nullable().describe("LinkedIn profile URL if found"),
    company: z.string().nullable().describe("Current company if found"),
    jobTitle: z.string().nullable().describe("Current job title if found"),
    summary: z.string().describe("Brief summary of findings"),
  }),
  tools: {
    webSearch: openai.tools.webSearch({}),
  },
  specPath: path.resolve(__dirname, "./enrich-lead.md"),
});
```

What changed:
1. **Description** — expanded with Implementation, Tools needed, Guidelines
2. **inputSchema** — filled with typed fields derived from Input Description
3. **outputSchema** — filled with typed fields derived from Output Description
4. **tools** — `webSearch` added based on Tools needed

---

## Principles

1. **Draft first, ask later** — propose complete schemas based on descriptions; let the user correct rather than interrogating
2. **Preserve descriptions** — keep the original Input/Output Description fields from create-workflow
3. **Concrete types** — every field needs a type; no `any` or untyped fields
4. **Research before guessing** — check integration skills and provider docs before selecting tools/SDKs
