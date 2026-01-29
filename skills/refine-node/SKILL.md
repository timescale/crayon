---
name: refine-node
description: Refine node definitions in a workflow spec - adds detailed tools, guidelines, and output formats to nodes marked as NEW.
---

# Refine Node

This skill refines node definitions in an existing workflow spec. It takes nodes with basic descriptions and adds the detail needed for code generation.

**Announce at start:** "I'm using the refine-node skill to add detail to your workflow nodes."

---

## Usage

```
/0pflow:refine-node <workflow-name>
/0pflow:refine-node <workflow-name> <node-name>
```

- With just workflow name: refines all nodes marked NEW
- With node name: refines only that specific node

---

## Process

### Step 1: Load the Workflow Spec

Read `specs/workflows/<workflow-name>.md` and assess each node.

A node **needs refinement** if it's missing:
- Clear description of what it does
- Detailed output schema with field descriptions

For **agent nodes**, also check for:
- Tools needed
- Guidelines for behavior

A node is **already complete** if it has all the above, regardless of NEW marker.

Report: "Found N nodes. M could use more detail: [list with brief reason]"

Example: "Found 4 nodes. 2 could use more detail:
- `company-researcher` - missing tools and guidelines
- `icp-scorer` - output schema is vague"

If a specific node was requested, focus only on that node.

### Step 2: Refine Each Node

For each node needing refinement, ask questions ONE AT A TIME:

#### 2.0 Check for Integration Skills

Before refining a node, check if it interacts with an external system (Salesforce, HubSpot, Slack, etc.). If so, read the relevant integration skill in `skills/integrations/` first.

Integration skills provide:
- Pre-built scripts for schema/type generation
- Authentication patterns
- API-specific details and quirks
- Node templates

**These nodes still need refinement**, but focus on *what* the user wants (which fields, which objects, what to do with the data) rather than *how* to connect. The integration skill handles the technical details - use it to inform the output schema and available capabilities.

#### 2.1 Analyze Current Description

Read the current description and identify what's already clear vs. what's missing.

- If purpose is clear: Skip to asking about missing pieces (tools, guidelines, output)
- If purpose is vague: Ask a targeted follow-up based on what's unclear

**Don't ask generic questions.** Use the description to ask specific follow-ups:

- "You mentioned 'research the company' - what specific information is most important? (e.g., funding, team size, product)"
- "For 'score against ICP' - what criteria define a good fit?"
- "When you say 'enrich the lead' - which data sources should it check?"

#### 2.2 Tools (Agent Nodes Only)

Skip this step for function and tool nodes.

For agent nodes, suggest relevant tools based on the description and ask for confirmation:

- "Research company" → "This likely needs web scraping to gather company info. Any specific APIs? (LinkedIn, Clearbit, etc.)"
- "Score against criteria" → "This sounds like pure reasoning over the input data - no external tools needed. Is that right?"
- "Send notification" → "Which channel? Slack, email, or something else?"

Tailor the question to what the node actually does. Don't present a generic menu.

#### 2.3 Guidelines (Agent Nodes Only)

Skip this step for function and tool nodes.

"Any specific guidelines for how this should work?"

Prompt for:
- Preferred data sources or approaches
- How to handle missing/uncertain data
- Quality or accuracy requirements
- Edge cases to handle

If the user is unsure, suggest reasonable defaults based on the node's purpose.

#### 2.4 Output Format

"What fields should the output include?"

Get specific:
- Field names and types
- Which fields are optional (use `?`)
- Any nested structures

Present the proposed output schema for confirmation:
```
company_data: {
  name: string
  description: string
  team_size?: number
  funding?: string
}
```

### Step 3: Update the Spec

After gathering all details for a node, update the task in the workflow spec.

**Format varies by node type:**

For **agent** nodes:
```markdown
### N. Task Name

<Expanded description with full context>

**Tools needed:** <tools list>
**Guidelines:** <specific guidelines>
**Output fields:** <field descriptions>

**Node:** `node-name` (agent)
**Input:** <inputs>
**Output:** `var_name: { field: type, field2?: type }`
```

For **function** and **tool** nodes:
```markdown
### N. Task Name

<Description>

**Node:** `node-name` (function|tool)
**Input:** <inputs>
**Output:** `var_name: { field: type, field2?: type }`
```

Note: "Tools needed", "Guidelines", and "Output fields" only apply to agent nodes. For function/tool nodes, the Output line captures the schema directly.

### Step 4: Continue or Complete

After refining a node:
- If more nodes need refinement: "Node refined. Next up: `<next-node>`. Ready to continue?"
- If all done: "All nodes refined. **Next step:** Run `/0pflow:compile-workflow` to generate TypeScript."

---

## Key Principles

1. **One question at a time** - Don't overwhelm with multiple questions
2. **Offer sensible defaults** - If user is unsure, suggest based on context
3. **Confirm before writing** - Show proposed changes before updating spec
4. **Preserve existing detail** - Don't overwrite manually-added information

---

## Example Session

```
User: /0pflow:refine-node lead-scoring

Agent: I'm using the refine-node skill to add detail to your workflow nodes.

Reading specs/workflows/lead-scoring.md...

Found 4 nodes. 2 could use more detail:
- `company-researcher` - missing tools and guidelines
- `icp-scorer` - output schema is vague

Starting with `company-researcher`.

**Current description:** "Gather information about the company from their website."

The purpose is clear. I see it should gather company info - what specific fields matter most? (e.g., funding status, team size, product description, market/industry)

User: We need company name, what they do, how big they are, and funding if available

Agent: Got it. What tools does this agent need?
- A) Web search / scraping
- B) Specific APIs (which ones?)
- C) Database queries
- D) Just reasoning over provided data
- E) Multiple

User: A - web scraping

Agent: Any specific guidelines for how this should work?

For example:
- Preferred data sources?
- How to handle missing information?

User: Prefer the company's own website and LinkedIn. If info isn't available, mark as unknown rather than guessing.

Agent: Here's the proposed output schema:

```
company_data: {
  name: string
  description: string
  product: string
  team_size?: number
  funding?: string
}
```

Does this look right? Any fields to add or change?

User: Add market/industry

Agent: Updated. Here's the refined node definition:

### 1. Research Company

Gather comprehensive information about the company including their product,
what market they serve, team size, and funding status.

**Tools needed:** web scraping
**Guidelines:** Prefer primary sources (company website, LinkedIn) over aggregators.
If information is unavailable, indicate "unknown" rather than guessing.
**Output fields:** name, description, product, market, team_size (optional), funding (optional)

**Node:** `company-researcher` (agent)
**Input:** company_url
**Output:** `company_data: { name: string, description: string, product: string, market: string, team_size?: number, funding?: string }`

I've updated the spec. Next up: `icp-scorer`. Ready to continue?

User: Yes

[... continues for remaining nodes ...]

Agent: All nodes refined. **Next step:** Run `/0pflow:compile-workflow` to generate TypeScript.
```
