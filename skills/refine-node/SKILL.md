---
name: refine-node
description: Refine node definitions in a workflow spec - determines HOW each node is implemented (SDKs, libraries, input/output structures, tools, guidelines).
---

# Refine Node

This skill refines node definitions in an existing workflow spec. While the create-workflow phase determines **WHAT** each node does, this phase determines **HOW** each node is implemented:

- **Input/Output structures** - Exact typed schemas (field names, types) based on the plain language descriptions
- **Implementation approach** - Which SDKs, libraries, or APIs to use
- **Tools** - For agent nodes, which tools they need access to
- **Guidelines** - Behavioral guidelines for agent nodes

This skill frequently uses `/0pflow:integrations` to determine the technical approach for nodes that interact with external systems (Salesforce, HubSpot, Slack, etc.).

**Announce at start:** "I'm using the refine-node skill to add implementation details to your workflow nodes."

---

## Usage

```
/0pflow:refine-node <workflow-name>
/0pflow:refine-node <workflow-name> <node-name>
```

- With just workflow name: refines all nodes that need input/output structures
- With node name: refines only that specific node

---

## Process

### Step 1: Load the Workflow Spec

Read `specs/workflows/<workflow-name>.md` and assess each node.

Nodes from the create-workflow phase have:
- **Input Description:** Plain language description of what inputs the node needs
- **Output Description:** Plain language description of what the node produces

A node **needs refinement** if it's missing:
- **Input:** (typed schema) - the exact input structure
- **Output:** (typed schema) - the exact output structure

For **agent nodes**, also check for:
- Tools needed
- Guidelines for behavior

A node is **already complete** if it has typed Input/Output schemas (and tools/guidelines for agents).

Report: "Found N nodes. M need refinement: [list]"

Example: "Found 4 nodes. All need refinement:
- `web_search` - needs input/output structure
- `company-researcher` - needs input/output structure, tools, guidelines
- `icp-scorer` - needs input/output structure, tools, guidelines
- `slack_postMessage` - needs input/output structure"

If a specific node was requested, focus only on that node.

### Step 2: Refine Each Node

For each node needing refinement, ask questions ONE AT A TIME:

#### 2.0 Determine Implementation Approach

**IMPORTANT - DO NOT SKIP:** Before refining a node, determine HOW it will be implemented:

1. **Check if it interacts with an external system** (Salesforce, HubSpot, Slack, databases, etc.)
   - If so, invoke `/0pflow:integrations` to determine which SDK, library, or API to use
   - Do not proceed until you've loaded the integration skill

2. **For internal/compute nodes**, determine:
   - Which libraries or packages are needed
   - Whether it's a simple function or requires external dependencies

Integration skills provide implementation details:
- Which TypeScript SDK or npm package to use
- Authentication patterns and setup
- API-specific details and quirks
- Pre-built scripts for schema/type generation

After loading the integration skill:
- **For listed integrations** (Salesforce, HubSpot, etc.): Read the specific file (e.g., `salesforce.md`) and follow its instructions.
- **For unlisted systems:** Read `unlisted.md` and follow the research process to find the best SDK/API option.

Add an `**Implementation:**` line to the node spec documenting the approach, e.g.:
```
**Implementation:** Salesforce REST API via `jsforce` npm package (see `/0pflow:integrations salesforce`)
```
or:
```
**Implementation:** HubSpot API via `@hubspot/api-client` npm package
```
or for simple nodes:
```
**Implementation:** Pure TypeScript function, no external dependencies
```

#### 2.1 Review Descriptions and Clarify

Read the **Input Description** and **Output Description** from the spec.

- If descriptions are clear enough to determine structure: Move to determining the typed schemas
- If descriptions are vague: Ask a targeted follow-up based on what's unclear

**Don't ask generic questions.** Use the descriptions to ask specific follow-ups:

- "The output description says 'company information for ICP fit' - what specific fields matter? (e.g., funding, team size, industry)"
- "For 'a qualification score with reasoning' - what's the score range? How detailed should the reasoning be?"
- "The input description mentions 'lead contact information' - which fields specifically? (email, phone, name, company?)"

#### 2.2 Determine Input Structure

Based on the **Input Description**, determine the exact typed input schema.

Ask: "Based on the input description, here's the proposed input structure:"

```
company_url: string
```

"Does this capture what's needed? Any fields to add or change?"

Present using TypeScript-style types:
- Simple types: `string`, `number`, `boolean`
- Objects: `{ field1: string, field2?: number }` (? = optional)
- Arrays: `string[]` or `{ name: string }[]`

#### 2.3 Tools (Agent Nodes Only)

Skip this step for function and tool nodes.

**Required: Check Provider Tool Documentation**

Before selecting tools, you **MUST** check the Vercel AI SDK documentation for available provider tools:

- **OpenAI:** https://ai-sdk.dev/providers/ai-sdk-providers/openai
- **Anthropic:** https://ai-sdk.dev/providers/ai-sdk-providers/anthropic

Use `WebFetch` to read these pages. They list all available provider tools (e.g., `webSearch()`, `codeInterpreter()`, `computer()`) with their configuration options.

---

For agent nodes, explicitly select tools from three categories:

**Tool Categories:**

| Category | Description | Examples |
|----------|-------------|----------|
| **Built-in nodes** | Ships with 0pflow | `webRead` |
| **Provider tools** | From AI SDK providers (OpenAI, Anthropic) | `openai.tools.webSearch()`, `openai.tools.codeInterpreter()`, `anthropic.tools.computer_20250124()` |
| **User nodes** | Custom nodes in `src/nodes/` | `enrichCompany`, `sendSlackMessage` |

**Selection Process:**

1. Based on the node description, identify what capabilities are needed
2. Map each capability to a specific tool with its exact name and category
3. Confirm with user

**Common Mappings:**

| Need | Tool | Category |
|------|------|----------|
| Fetch web pages / HTTP requests | `webRead` | builtin |
| Search the web | `openai.tools.webSearch()` | provider |
| Run Python code | `openai.tools.codeInterpreter()` | provider |
| Domain-specific operations (CRM, email, etc.) | User must implement | user node |

**Example dialogue:**

"For researching companies, I recommend these tools:
- `webRead` (builtin) - fetch company website
- `openai.tools.webSearch()` (provider) - search for company info

Does this look right? Any other tools needed?"

If the user needs something not covered by builtin or provider tools:

1. **Create the user node spec** - Add a new node definition to the workflow spec with:
   - Name and description
   - Input/output schema
   - Note: `(user node - must implement in src/nodes/<name>.ts)`

2. **Refine it** - Ask the same questions (purpose, inputs, outputs) to fully specify what the node should do

3. **Add to Tools needed** - Reference it as `nodeName (user node in src/nodes/<name>.ts)`

This ensures the compile-workflow skill knows to expect a user implementation and can generate the proper import.

#### 2.4 Guidelines (Agent Nodes Only)

Skip this step for function and tool nodes.

"Any specific guidelines for how this should work?"

Prompt for:
- Preferred data sources or approaches
- How to handle missing/uncertain data
- Quality or accuracy requirements
- Edge cases to handle

If the user is unsure, suggest reasonable defaults based on the node's purpose.

#### 2.5 Determine Output Structure

Based on the **Output Description**, determine the exact typed output schema.

Ask: "Based on the output description, here's the proposed output structure:"

```
company_data: {
  name: string
  description: string
  industry: string
  team_size?: number
  funding?: string
  is_b2b: boolean
  is_saas: boolean
}
```

"Does this capture what's needed? Any fields to add or change?"

Get specific:
- Field names and types
- Which fields are optional (use `?`)
- Any nested structures

### Step 3: Update the Spec

After gathering all details for a node, update the task in the workflow spec.

**The refined spec preserves the descriptions and adds implementation details:**

For **agent** nodes:
```markdown
### N. Task Name

<Expanded description with full context>

**Implementation:** <SDK, library, or approach to use>
**Tools needed:**
  - webRead (builtin)
  - openai.tools.webSearch() (provider)
  - myCustomNode (user node in src/nodes/my-custom-node.ts)
**Guidelines:** <specific guidelines>

**Node:** `node-name` (agent)
**Input Description:** <original description from create-workflow>
**Input:** `var_name: type` or `{ field: type, field2: type }`
**Output Description:** <original description from create-workflow>
**Output:** `var_name: { field: type, field2?: type }`
```

Each tool must specify its category: `(builtin)`, `(provider)`, or `(user node in <path>)`.

For **function** and **node** nodes:
```markdown
### N. Task Name

<Description>

**Implementation:** <SDK, library, or approach to use>
**Node:** `node-name` (node)
**Input Description:** <original description>
**Input:** `var_name: type` or `{ field: type }`
**Output Description:** <original description>
**Output:** `var_name: { field: type, field2?: type }`
```

Note: "Tools needed" and "Guidelines" only apply to agent nodes.

**IMPORTANT: Write to the spec file immediately after presenting the refined node definition.** Do not wait until all nodes are complete. Update `specs/workflows/<workflow-name>.md` after each node is refined.

### Step 4: Continue or Complete

After refining and writing a node to the spec:
- If more nodes need refinement: "I've updated the spec. Next up: `<next-node>`. Ready to continue?"
- If all done: "All nodes refined. **Next step:** Run `/0pflow:compile-workflow` to generate TypeScript."

---

## Key Principles

1. **One question at a time** - Don't overwhelm with multiple questions
2. **Write after each node** - Update the spec file immediately after each node is refined, not at the end
3. **Offer sensible defaults** - If user is unsure, suggest based on context
4. **Confirm before writing** - Show proposed changes before updating spec
5. **Preserve existing detail** - Don't overwrite manually-added information

---

## Example Session

```
User: /0pflow:refine-node lead-scoring

Agent: I'm using the refine-node skill to add detail to your workflow nodes.

Reading specs/workflows/lead-scoring.md...

Found 4 nodes. All need refinement:
- `web_search` - needs input/output structure
- `company-researcher` - needs input/output structure, tools, guidelines
- `icp-scorer` - needs input/output structure, tools, guidelines
- `slack_postMessage` - needs input/output structure

Starting with `company-researcher`.

**Input Description:** The company's website URL
**Output Description:** Information about the company relevant to ICP fit: their industry, number of employees, whether they are B2B, SaaS, etc.

This is an agent that researches companies from websites. It doesn't need external system integrations (like CRM), so the implementation will use web scraping and search tools. No special SDK needed.

The descriptions are clear. Let me propose the typed structures.

For the input, I propose:
```
company_url: string
```

Does this look right?

User: Yes

Agent: For the output, based on the description mentioning industry, employees, B2B, and SaaS, I propose:

```
company_data: {
  name: string
  description: string
  industry: string
  employee_count?: number
  is_b2b: boolean
  is_saas: boolean
  funding?: string
}
```

Does this capture what's needed? Any fields to add or change?

User: Add a product field for what they sell

Agent: Got it. For gathering company info, I recommend these tools:
- `webRead` (builtin) - fetch the company website directly
- `openai.tools.webSearch()` (provider) - search for additional company info

Does this look right? Any other tools needed?

User: That works

Agent: Any specific guidelines for how this should work?

For example:
- Preferred data sources?
- How to handle missing information?

User: Prefer the company's own website and LinkedIn. If info isn't available, mark as unknown rather than guessing.

Agent: Here's the refined node definition:

### 2. Research Company

Gather comprehensive information about the company including their product,
what market they serve, team size, and funding status.

**Implementation:** AI agent using web scraping and search (no external SDK needed)
**Tools needed:**
  - webRead (builtin)
  - openai.tools.webSearch() (provider)
**Guidelines:** Prefer primary sources (company website, LinkedIn) over aggregators.
If information is unavailable, indicate "unknown" rather than guessing.

**Node:** `company-researcher` (agent)
**Input Description:** The company's website URL
**Input:** `company_url: string`
**Output Description:** Information about the company relevant to ICP fit: their industry, number of employees, whether they are B2B, SaaS, etc.
**Output:** `company_data: { name: string, description: string, product: string, industry: string, employee_count?: number, is_b2b: boolean, is_saas: boolean, funding?: string }`

[Writes updated node to specs/workflows/lead-scoring.md]

I've updated the spec. Next up: `fetch-salesforce-lead`. Ready to continue?

User: Yes

Agent: Looking at `fetch-salesforce-lead`:

**Input Description:** The lead's email address
**Output Description:** The lead record from Salesforce with contact info and status

This node interacts with Salesforce, so I need to check the integration skill.

[Invokes /0pflow:integrations salesforce]

Based on the Salesforce integration guide, this uses the Salesforce GraphQL API with `graphql-request` and generates typed queries via `graphql-codegen`. The integration skill handles schema fetching and SDK generation.

For the input structure:
```
email: string
```

For the output, Salesforce Lead objects have standard fields. Based on your description wanting contact info and status:
```
lead: {
  Id: string
  Email: string
  FirstName: string
  LastName: string
  Company: string
  Status: string
  Phone?: string
  Title?: string
}
```

Does this capture what you need from the lead record?

User: Yes, also add the lead source

Agent: Here's the refined node definition:

### 3. Fetch Salesforce Lead

Retrieve the lead record from Salesforce by email address.

**Implementation:** Salesforce GraphQL API via `graphql-request` with typed SDK (see `/0pflow:integrations salesforce`)
**Node:** `fetch-salesforce-lead` (node)
**Input Description:** The lead's email address
**Input:** `email: string`
**Output Description:** The lead record from Salesforce with contact info and status
**Output:** `lead: { Id: string, Email: string, FirstName: string, LastName: string, Company: string, Status: string, LeadSource: string, Phone?: string, Title?: string }`

[Writes updated node to specs/workflows/lead-scoring.md]

I've updated the spec. Next up: `icp-scorer`. Ready to continue?

[... continues for remaining nodes ...]

Agent: All nodes refined. **Next step:** Run `/0pflow:compile-workflow` to generate TypeScript.
```
