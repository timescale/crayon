---
name: create-workflow
description: Collaborative workflow design - guides users through creating well-structured 0pflow workflow specs. Use this when creating new workflows.
---

# Create Workflow

This skill guides you through designing a workflow specification for 0pflow. We'll work together step-by-step to turn your workflow idea into a well-structured spec that can be compiled into executable code.

**Announce at start:** "I'm using the create-workflow skill. We'll first design the high-level workflow structure, then refine the individual nodes with more detail."

---

## Pre-Flight Check

Before starting, perform these checks:

1. **Check directories exist:**
   - If `specs/workflows/` doesn't exist, create it
   - If `specs/agents/` doesn't exist, create it

2. **Read existing context:**
   - Read all files in `specs/workflows/*.md` to understand existing workflows
   - Read all files in `specs/agents/*.md` to know available agents
   - Note what exists so you can suggest reuse

3. **Report context to user:**
   - "Found N existing workflows: [names]"
   - "Found M existing agents: [names]"
   - Or "This appears to be a new project with no existing specs"

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

### For each task, ask:

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
   - An **agent** task? (needs AI reasoning/judgment)
   - A **function**? (deterministic computation)
   - A **tool** call? (direct API call)

3. **Node selection** - Check if an existing node fits:
   - Existing agents from `specs/agents/`
   - Built-in tools: `http_get`
   - User-defined functions in `src/nodes/`

   If nothing fits, we'll create a new agent or function.

4. **Inputs** - What data does this task need? (from workflow inputs or previous tasks)

5. **Outputs** - What variable name holds this task's result?

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

### 3.1 Present Inputs

"Here's the **Inputs** section I've captured:"

```markdown
## Inputs

- input_name: type (required|optional, defaults to X) - Description
```

**Type syntax:**
- Simple types: `string`, `number`, `boolean`
- Union types: `"value1" | "value2"`
- Objects: `{ field1: type, field2: type, field3?: type }` (? = optional)
- Arrays: `string[]` or `{ name: string }[]`

"Does this look right? Any changes?"

### 3.2 Present Tasks

"Here are the **Tasks**:"

Present each task:

```markdown
### N. Task Name

Description of what this task does.

**Node:** `node-name` (agent|function|tool)
**Input:** var1, var2
**Output:** `result_var: type`
```

**Output type syntax:**
- Simple: `result: string`
- Object: `company_data: { name: string, funding?: string }`
- Array: `matches: { url: string, score: number }[]`

For decision tasks that may terminate the workflow:

```markdown
### N. Decision Name

Description of the decision.

**Condition:** `variable.field >= value`
**If true:** continue to task M
**If false:** return:
  - status: "rejected"
  - score: score_result.score
  - data: company_data
```

**Important:** If the workflow defines outputs, every terminating path must return the same fields as the workflow outputs.

"Does this look right? Any changes?"

### 3.3 Present Outputs (Optional)

Ask: "Does this workflow need to return data to the caller? Or does it just perform actions (like sending notifications)?"

If the workflow returns data, present the outputs section:

"Here's the **Outputs** section:"

```markdown
## Outputs

- field_name: type - Description
- another_field: type - Description
```

Workflow outputs are always an object with named fields. Each field has a type:
- Simple types: `string`, `number`, `boolean`
- Union types: `"value1" | "value2"`
- Objects: `{ field1: type, field2?: type }` (? = optional)
- Arrays: `string[]` or `{ id: number, name: string }[]`

For nested objects, always specify the schema inline rather than using generic `object`.

"Does this look right? Any changes?"

If the workflow only performs side effects (notifications, CRM updates, etc.) with no return value, skip the Outputs section entirely.

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

2. Assess which nodes might benefit from more detail (missing tools, guidelines, or clear output schemas). If any:
   "Some nodes could use more detail:
   - `<node1>` - missing tools/guidelines
   - `<node2>` - output schema is vague"

   Ask: "Would you like to refine these nodes now?"

   - If yes: Invoke `/0pflow:refine-node` for the workflow
   - If no: "No problem. Run `/0pflow:refine-node <workflow-name>` later when you're ready. Then run `/0pflow:compile-workflow` to generate TypeScript."

3. If all nodes already have sufficient detail:
   "All nodes have clear definitions. **Next step:** Run `/0pflow:compile-workflow` to generate TypeScript."

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

[Pre-flight] Found 0 existing workflows. Found 0 existing agents.
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

**Task 1: Research Company**
- Gather information about the company
- **Node:** `company-researcher` (agent) - NEW
- **Input:** company_url
- **Output:** `company_data: { name: string, description: string, team_size?: number, funding?: string }`

What happens after we have the company data?

[... continues until workflow is complete ...]

Agent: Here's the **Inputs** section:

## Inputs
- company_url: string (required) - The company website URL

Does this look right?

User: Yes

Agent: Here are the **Tasks**:

### 1. Research Company
Gather comprehensive information about the company...
**Node:** `company-researcher` (agent)
**Input:** company_url
**Output:** `company_data: { name: string, description: string, team_size?: number, funding?: string }`

---

### 2. Score Against ICP
Evaluate if company matches B2B SaaS $5M+ ARR criteria...
**Node:** `icp-scorer` (agent)
**Input:** company_data
**Output:** `score_result: { score: number, reasons: string[] }`

---

### 3. Decision
Route based on score.
**Condition:** `score_result.score >= 80`
**If true:** continue to task 4
**If false:** return:
  - qualification: "not_qualified"
  - score: score_result.score
  - company_data: company_data

---

### 4. Notify Sales
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

This workflow references new agents that don't exist yet:
- `company-researcher` - researches company info from URL
- `icp-scorer` - scores company against ICP criteria

These will be created as stubs when you run compile-workflow.

**Next steps:**
- Run `/0pflow:compile-workflow` to generate TypeScript and create agent stubs
- Review and refine the generated agent stubs in `specs/agents/`
```
