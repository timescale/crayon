---
name: create-workflow
description: Collaborative workflow design - guides users through creating well-structured 0pflow workflow specs. Use this when creating new workflows.
---

# Create Workflow

This skill guides you through designing a workflow specification for 0pflow. We'll work together step-by-step to turn your workflow idea into a well-structured spec that can be compiled into executable code.

---

## Pre-Flight Check

Before starting, perform these checks:

### 1. Detect Project Type

Check if this is a **new project** or an **existing 0pflow project**:

- **New project indicators:** No `package.json` and the directory is empty
- **Existing project indicators:** Has `specs/workflows/` or `specs/agents/` directories

### 2. Discover Available Integrations

Call `list_integrations` on the 0pflow MCP server to discover what integrations are available:

```
Use the mcp__plugin_0pflow_0pflow__list_integrations tool
```

This returns the user's connected integrations (Slack, Salesforce, HubSpot, etc.) with their credentials. Store this information so you can:
- Suggest relevant integrations during workflow design
- Know which external systems are available for tasks
- Guide users toward integrations they already have connected

Report to user: "Found N connected integrations: [list names]" or "No integrations connected yet."

### 3. For New Projects - Offer App Scaffolding

If this appears to be a new project (empty directory or no 0pflow structure):

Ask the user: "This looks like a new project. Would you like me to scaffold a full app with the T3 Stack template (Next.js + tRPC + Drizzle)? Or do you want to add 0pflow to an existing project?"

- **If scaffold new app:** Read `app-scaffolding.md` in this skill directory and follow those instructions first. Then return here to continue with workflow creation.
- **If existing project:** Just create the `specs/` directories and continue.

### 4. Ensure Directories Exist

- If `specs/workflows/` doesn't exist, create it
- If `specs/agents/` doesn't exist, create it

### 5. Read Existing Context

- Read all files in `specs/workflows/*.md` to understand existing workflows
- Read all files in `specs/agents/*.md` to know available agents
- Note what exists so you can suggest reuse

### 6. Report Context and Announce

**IMPORTANT:** If scaffolding was performed, steps 5-6 MUST happen AFTER scaffolding completes and you return here.

First, report what exists:
- "Found N existing workflows: [names]"
- "Found M existing agents: [names]"
- Or "This appears to be a new project with no existing specs"

Then announce:
"I'm using the create-workflow skill. We'll first design the high-level workflow structure, then refine the individual nodes with more detail."

---

## Phase 1: Understanding the Workflow Intent

Ask questions ONE AT A TIME. Wait for each answer before asking the next.

### Question 1: Trigger

"What triggers this workflow?"
- A) Webhook from external system (form submission, CRM event, etc.)
- B) Manual trigger with specific input data
- C) Scheduled batch run
- D) Other (please describe)

### Question 2: Goal

"What's the desired outcome when this workflow completes successfully?"

Push for specifics. If the user says "score leads", ask what scoring means - a number? A label? What actions follow?

### Question 3: Systems

"What systems or data sources will this workflow interact with?"
- Company websites (scraping/research)
- CRM (Salesforce, HubSpot)
- Communication (Slack, email)
- Internal database
- External APIs
- Other

> **Note:** For common integrations (Salesforce, HubSpot, etc.), technical details like authentication, API versions, and schema setup are handled by the `/0pflow:integrations` skill. Users only need to specify *what* data they need, not *how* to fetch it.

### Question 4: Name

Based on answers, propose a name:
- Lowercase with hyphens
- Descriptive of outcome (e.g., `icp-scoring`, `lead-enrichment`)

"I'll name this workflow `<name>`. Does that work?"

---

## Phase 2: Identifying Tasks and Nodes

Walk through the workflow task-by-task.

### For each task:

**First, show the workflow so far** with an ASCII diagram:

```
┌─────────────┐
│   Trigger   │
│ (inputs)    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Task 1     │
│ node-name   │
└──────┬──────┘
       │
       ▼
      ???
```

Update the diagram as tasks are added. Use `???` to show where we're asking about next.

**Then ask:**

"After [previous task/trigger], what happens next?"

If the user describes a **decision point** (branching conditional), switch to:

1. "What's the exact condition for this decision?" (get specific: `score >= 80`, not "if it's good")
2. "What happens when [condition] is TRUE?"
3. Continue exploring the TRUE branch until it ends (return or converges)
4. "Now for the FALSE branch: what happens when [condition] is FALSE?"
5. Continue exploring the FALSE branch until it ends

Track which paths lead to early returns vs. continuing to subsequent tasks.

For non-branching tasks, determine:

1. **Description** - What does this task do in plain language?

2. **Node type** - Is this:
   - An **agent**? (needs AI reasoning/judgment)
   - A **node**? (function or API call)

3. **Node selection** - Check if an existing node fits:
   - Existing agents from `specs/agents/`
   - Built-in nodes: `web_read`
   - User-defined nodes in `src/nodes/`

   If nothing fits, we'll create a new agent or node.

4. **Inputs** - What data does this task need? (from workflow inputs or previous tasks)

5. **Outputs** - What variable name holds this task's result?

Note: Detailed tool selection for agents is handled later by `/0pflow:refine-node`.

### For new nodes:

When a task requires a new node, capture a clear description of what it does. If the user provides enough detail during this phase, capture it. If not, it can be refined later with `/0pflow:refine-node`.

```markdown
### N. Research Company

Gather information about the company from their website.

**Node:** `company-researcher` (agent)
**Input:** company_url
**Output:** `company_data: { name: string, description: string }`
```

### For decision points:

When the user describes branching logic, nail down the exact condition:

- BAD: "if it's a good fit"
- GOOD: "if score >= 80"

Ask: "What's the exact condition for this decision?"

### Continue until done:

Keep asking "What happens next?" until the user indicates the workflow is complete.

For workflows with branches:
- Explore each branch fully before moving to the next
- Note when branches converge (rejoin the main flow)
- Ensure every terminating path returns the same output fields

---

## Phase 3: Presenting and Validating the Spec

Present each section for validation. Wait for approval before proceeding.

### 3.0 Present Workflow Diagram

First, present an ASCII diagram showing the workflow structure:

"Here's the workflow structure:"

```
┌─────────────┐
│   Trigger   │
│ (input)     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Task 1     │
│ node-name   │
└──────┬──────┘
       │
       ▼
   ◇ Decision?
  ╱           ╲
YES             NO
 │               │
 ▼               ▼
┌─────┐      ┌──────┐
│Task2│      │Return│
└──┬──┘      └──────┘
   │
   ▼
┌─────────────┐
│   Return    │
└─────────────┘
```

Adapt the diagram to match the actual workflow tasks and branches discovered in Phase 2. Use:
- `┌─────┐` boxes for tasks
- `◇` diamonds for decision points
- `▼` arrows for flow direction
- Show both branches for decisions

"Does this flow look correct?"

### 3.1 Present Workflow Interface (Inputs & Outputs)

Present the overall workflow contract - what goes in and what comes out:

"Here's the **workflow interface** - the inputs it receives and outputs it returns:"

```markdown
## Inputs

- input_name: type (required|optional, defaults to X) - Description

## Outputs

- field_name: type - Description
```

**Type syntax:**
- Simple types: `string`, `number`, `boolean`
- Union types: `"value1" | "value2"`
- Objects: `{ field1: type, field2: type, field3?: type }` (? = optional)
- Arrays: `string[]` or `{ name: string }[]`

If the workflow only performs side effects (notifications, CRM updates, etc.) with no return value, omit the Outputs section.

"Does this interface look right? Any changes?"

### 3.2 Present Tasks

Present all tasks together (we already walked through each one in Phase 2).

**Before presenting, verify completeness:**
- Include any tool implementation tasks identified in Phase 2 (e.g., `web_search`, `linkedin_lookup`)
- Tool implementation tasks should appear BEFORE the agent tasks that use them
- These are regular workflow tasks with `(node)` type

"Here are the **Tasks**:"

```markdown
## Tasks

### 1. Task Name
Description of what this task does.
**Node:** `node-name` (agent|node)
**Input:** var1, var2
**Output:** `result_var: type`

---

### 2. Next Task
...

---

### 3. Decision Name
**Condition:** `variable.field >= value`
**If true:** continue to task 4
**If false:** return early with outputs

---

### 4. Final Task
...
**Return:** (final outputs)
```

**Important:** Every terminating path must return the same fields as the workflow outputs.

"Does this look right? Any changes?"

---

## Phase 4: Write the Specs

### 4.1 Write Workflow Spec

Write to `specs/workflows/<name>.md`:

```markdown
---
name: <workflow-name>
version: 1
---

# <Workflow Title>

<One-line description>

## Inputs

<validated inputs>

## Tasks

<validated tasks with --- separators between each>

## Outputs (optional)

<validated outputs, or omit this section if workflow has no return value>
```

### 4.2 Report Results and Transition

Tell the user:

1. "I've written the workflow spec to `specs/workflows/<name>.md`"

2. Identify any NEW nodes created during this workflow design (not built-in nodes like `web_read`, and not existing nodes from `src/nodes/`). New nodes MUST be refined before compilation:
   "The following new nodes need to be refined before compilation:
   - `<node1>` - new node
   - `<node2>` - new node"

   Ask: "Would you like to refine these nodes now?"

   - If yes: Invoke `/0pflow:refine-node` for the workflow
   - If no: "No problem. Run `/0pflow:refine-node <workflow-name>` later when you're ready. Then run `/0pflow:compile-workflow` to generate TypeScript."

   **IMPORTANT:** New nodes MUST be refined before `/0pflow:compile-workflow` will succeed.

3. If all nodes are existing (built-in or already in `src/nodes/`):
   "All nodes use existing implementations. **Next step:** Run `/0pflow:compile-workflow` to generate TypeScript."

---

## Key Principles

1. **One question at a time** - Never ask multiple questions in one message
2. **Concrete over abstract** - Push for specific examples, not vague descriptions
3. **Fail closed** - When ambiguous, ask rather than assume
4. **Leverage existing** - Prefer reusing existing agents/tools
5. **Validate incrementally** - Confirm each section before moving on
6. **Multiple choice preferred** - Offer options when choices are clear

---

## Example Session

```
User: I want to score inbound leads

Agent: I'm using the create-workflow skill. We'll first design the high-level workflow structure, then refine the individual nodes with more detail.

[Pre-flight] Found 2 connected integrations: Slack, Salesforce.
Found 0 existing workflows. Found 0 existing agents.
This appears to be a new project with no existing specs.

**Question 1:** What triggers this workflow?
- A) Webhook from external system
- B) Manual trigger with specific input data
- C) Scheduled batch run
- D) Other

User: B

Agent: **Question 2:** What information do you have at trigger time?
- A) Just the company URL
- B) Company URL + contact email
- C) Full lead record from CRM
- D) Other

User: A - just the company URL

Agent: **Question 3:** What's a "qualified" lead for you? What criteria determine if a lead is good?

User: B2B SaaS companies with at least $5M ARR

Agent: **Question 4:** What should happen with qualified leads?
- A) Notify sales team (Slack/email)
- B) Create task in CRM
- C) Add to outreach sequence
- D) Multiple actions

User: A - Slack notification

Agent: I'll name this workflow `lead-scoring`. Does that work?

User: Yes

Agent: Let's walk through the tasks.

After receiving the company_url, what's the first thing that needs to happen?

User: Research the company

Agent: Got it. This sounds like an **agent** node since it requires judgment about what information is relevant.

I don't see any existing agents that fit. I'll create a new agent called `company-researcher`.

What tools does the `company-researcher` agent need?
- A) Web scraping / HTTP requests (web_read - built-in)
- B) Web search
- C) LinkedIn API
- D) Multiple of the above

User: A and B

Agent: `web_read` is built-in. For `web_search`, I'll add an implementation task.

What inputs/outputs should `web_search` have?

User: Takes a query string, returns list of results with title, url, snippet

Agent: Got it. I'm adding two tasks:

**Task 1: Implement web_search**
- Create web search capability
- **Node:** `web_search` (node) - needs implementation
- **Input:** query: string
- **Output:** `results: { title: string, url: string, snippet: string }[]`

**Task 2: Research Company**
- Gather information about the company
- **Node:** `company-researcher` (agent) - NEW
- **Tools:** `web_read`, `web_search`
- **Input:** company_url
- **Output:** `company_data: { name: string, description: string, team_size?: number, funding?: string }`

What happens after we have the company data?

[... continues through scoring, decision, and notification tasks ...]

Agent: Here's the **Inputs** section:

## Inputs
- company_url: string (required) - The company website URL

Does this look right?

User: Yes

Agent: Here are the **Tasks**:

### 1. Implement web_search

Create web search capability for the company-researcher agent.

**Node:** `web_search` (node)
**Input:** query: string
**Output:** `results: { title: string, url: string, snippet: string }[]`

---

### 2. Research Company
Gather comprehensive information about the company...
**Node:** `company-researcher` (agent)
**Tools:** `web_read`, `web_search`
**Input:** company_url
**Output:** `company_data: { name: string, description: string, team_size?: number, funding?: string }`

---

### 3. Score Against ICP
Evaluate if company matches B2B SaaS $5M+ ARR criteria...
**Node:** `icp-scorer` (agent)
**Input:** company_data
**Output:** `score_result: { score: number, reasons: string[] }`

---

### 4. Decision
Route based on score.
**Condition:** `score_result.score >= 80`
**If true:** continue to task 5
**If false:** return:
  - qualification: "not_qualified"
  - score: score_result.score
  - company_data: company_data

---

### 5. Notify Sales
Alert sales team about qualified lead.
**Tool:** `slack_postMessage`
**Input:** channel = "#sales-leads", message with company details
**Return:**
  - qualification: "qualified"
  - score: score_result.score
  - company_data: company_data

Does this look right?

User: Yes

Agent: Here's the **Outputs** section:

## Outputs
- qualification: "qualified" | "not_qualified"
- score: number
- company_data: { name: string, description: string, team_size?: number, funding?: string }

Does this look right?

User: Yes

Agent: I've written the workflow spec to `specs/workflows/lead-scoring.md`

**Next steps:**
- Implement the `web_search` node in `src/nodes/web-search.ts`
- Run `/0pflow:compile-workflow` to generate TypeScript and create agent stubs
```
