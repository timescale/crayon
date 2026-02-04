---
name: create-workflow
description: Collaborative workflow design - guides users through creating well-structured 0pflow workflow specs. Use this when creating new workflows.
---

# Create Workflow

This skill guides you through designing a workflow specification for 0pflow. We'll work together step-by-step to turn your workflow idea into a well-structured spec that can be compiled into executable code.

**Important:** This phase focuses on **WHAT** each node should do, not **HOW** it should do it. We capture the purpose and intent of each node—what information it needs and what it produces—described in plain language. Specific implementation details (exact fields, API schemas, tool configurations) are handled later in the refinement phase (`/0pflow:refine-node`).

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

4. **Input description** - What information does this task need? Describe in plain language what the inputs represent (e.g., "the company's website URL", "the lead's contact information"). Don't specify exact field names or types yet.

5. **Output description** - What does this task produce? Describe in plain language what the output represents (e.g., "information about the company including what they do and their size", "a qualification score with reasoning"). Don't specify exact field names or types yet.

Note: Detailed schemas, field names, and tool selection are handled later by `/0pflow:refine-node`.

### For new nodes:

When a task requires a new node, capture a clear description of what it does and what its inputs/outputs represent conceptually. Don't worry about exact field names or types—those are determined during refinement.

```markdown
### N. Research Company

Gather information about the company from their website.

**Node:** `company-researcher` (agent)
**Input Description:** The company's website URL
**Output Description:** Information about the company relevant to ICP fit: their industry, number of employees, whether they are B2B, SaaS, etc.
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

- input_name (required|optional) - Description of what this input represents

## Outputs

- Description of what the workflow returns when complete
```

Keep descriptions high-level. Exact field names and types are determined during refinement.

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
**Input Description:** What information this task needs
**Output Description:** What this task produces

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

**Important:** Every terminating path should return equivalent information as described in the workflow outputs.

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

2. List all the nodes in the workflow:
   "The following nodes need to be refined to define their exact input/output structures:
   - `<node1>`
   - `<node2>`
   - ..."

   Ask: "Would you like to refine these nodes now?"

   - If yes: Invoke `/0pflow:refine-node` for the workflow
   - If no: "No problem. Run `/0pflow:refine-node <workflow-name>` later when you're ready. Then run `/0pflow:compile-workflow` to generate TypeScript."

   **IMPORTANT:** All nodes MUST be refined before `/0pflow:compile-workflow` will succeed. The refinement phase determines exact field names, types, and implementation details.

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
- **Input Description:** A search query
- **Output Description:** Search results with titles, URLs, and snippets

**Task 2: Research Company**
- Gather information about the company
- **Node:** `company-researcher` (agent) - NEW
- **Tools:** `web_read`, `web_search`
- **Input Description:** The company's website URL
- **Output Description:** Information about the company relevant to ICP fit: their industry, number of employees, whether they are B2B, SaaS, etc.

What happens after we have the company data?

[... continues through scoring, decision, and notification tasks ...]

Agent: Here's the **Inputs** section:

## Inputs
- company_url (required) - The company's website URL to research

Does this look right?

User: Yes

Agent: Here are the **Tasks**:

### 1. Implement web_search

Create web search capability for the company-researcher agent.

**Node:** `web_search` (node)
**Input Description:** A search query
**Output Description:** Search results with titles, URLs, and snippets

---

### 2. Research Company
Gather comprehensive information about the company.
**Node:** `company-researcher` (agent)
**Tools:** `web_read`, `web_search`
**Input Description:** The company's website URL
**Output Description:** Information about the company relevant to ICP fit: their industry, number of employees, whether they are B2B, SaaS, etc.

---

### 3. Score Against ICP
Evaluate if company matches B2B SaaS $5M+ ARR criteria.
**Node:** `icp-scorer` (agent)
**Input Description:** The company information gathered in the previous step
**Output Description:** A qualification score (0-100) with reasoning for the score

---

### 4. Decision
Route based on score.
**Condition:** `score >= 80`
**If true:** continue to task 5
**If false:** return early (not qualified)

---

### 5. Notify Sales
Alert sales team about qualified lead.
**Node:** `slack_postMessage` (node)
**Input Description:** The Slack channel and a message with company details and score
**Return:** The qualification result, score, and company data

Does this look right?

User: Yes

Agent: Here's the **Outputs** section:

## Outputs
- The qualification result (qualified or not qualified)
- The ICP score
- The company information that was gathered

Does this look right?

User: Yes

Agent: I've written the workflow spec to `specs/workflows/lead-scoring.md`

The following nodes need to be refined to define their exact input/output structures:
- `web_search`
- `company-researcher`
- `icp-scorer`
- `slack_postMessage`

Would you like to refine these nodes now?

User: Yes

Agent: [Invokes /0pflow:refine-node lead-scoring]
```
