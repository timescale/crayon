# Salesforce Integration

Guide for generating typed Salesforce query nodes using GraphQL with `graphql-request` and `graphql-codegen`.

---

## CRITICAL: Connection Required

**This entire setup requires a live Salesforce connection.** Before doing ANYTHING below, `get_connection_info` for `"salesforce"` must succeed. If it fails (no connection configured or authentication error), **STOP — do not proceed with any steps in this file.** Do not create directories, scripts, client files, or any integration infrastructure. Tell the user to connect Salesforce via the Credentials page in the Dev UI sidebar (in a cloud sandbox, this is the browser tab they already have open). Then say "continue" when ready.

---

## Important: Schema-Driven Development

**Never guess at Salesforce field names or object structures.** Every Salesforce org has different custom fields, objects, and configurations.

During **node refinement** (`/crayon:refine-node`), when a workflow needs Salesforce data:

1. **Announce:** "This node needs Salesforce data. I'll set up the Salesforce integration to fetch your org's schema - this tells us exactly which fields and objects are available. We won't guess at field names."
2. Complete the setup below to fetch the actual schema from the user's Salesforce instance
3. The schema is saved to `src/integrations/salesforce/schemas/schema-clean.json`
4. Read this file to see available objects, fields, and their types
5. Define the node's output schema in the spec based on available fields
6. **STOP HERE during refinement** — do not proceed to codegen or creating the actual node. The actual GraphQL operations and node code are created later during `/crayon:compile-workflow`.

Refinement is only about understanding what's available and defining the spec.

---

## Pre-Flight Checks

### 1. Check for Existing Setup

Look for `src/integrations/salesforce/generated/graphql.ts`. If it exists, the typed SDK is ready.

If not: "I don't see a Salesforce SDK in your project. Would you like me to set it up?"

### 2. Get Credentials

**Use the `get_connection_info` tool** to look up the Salesforce connection:

```
get_connection_info({ integration_id: "salesforce", workflow_name: "lead-enrichment", node_name: "query-salesforce-leads" })
```

This returns:
- `connection_id` → pass to fetch-schema via `--connection-id`
- `connection_config.instance_url` → confirms the Salesforce instance
- `access_token` → used by the fetch-schema script

**Do NOT write access tokens to `.env`.** Tokens are short-lived and fetched on the fly via the integration provider.

**If `get_connection_info` fails** (no connection configured or authentication error), tell the user:
"No Salesforce connection found. Open the Credentials page in the Dev UI sidebar to connect your Salesforce account (in a cloud sandbox, use the browser tab you already have open). Then re-run this."

### 3. Check for Dependencies

```bash
# Runtime
npm i graphql graphql-request

# Codegen (dev)
npm i -D dotenv find-config he \
  @graphql-codegen/cli \
  @graphql-codegen/typescript \
  @graphql-codegen/typescript-operations \
  @graphql-codegen/typescript-graphql-request
```

---

## Directory Structure

```
src/integrations/salesforce/
├── client.ts                    # SDK factory with OAuth auth
├── generated/
│   └── graphql.ts               # Typed SDK (auto-generated)
├── graphql/
│   └── operations/
│       └── lead.graphql         # Query definitions
├── schemas/
│   └── schema-clean.json        # Fetched & cleaned schema
└── scripts/
    ├── codegen.ts               # GraphQL codegen config
    └── fetch-schema.ts          # Fetches, cleans, and fixes schema
```

---

## Schema Setup

### Step 1: Resolve Salesforce Domain

The domain should already be in `.env` from the pre-flight checks (via `get_connection_info`).

If not present, ask: "What is your Salesforce domain?"
- Production: `https://yourcompany.my.salesforce.com`
- Sandbox: `https://yourcompany--sandbox.sandbox.my.salesforce.com`

### Step 2: Create Directory Structure

```bash
mkdir -p src/integrations/salesforce/{scripts,schemas,graphql/operations,generated}
```

### Step 3: Copy fetch-schema.ts

Copy from this skill's `scripts/fetch-schema.ts` to `src/integrations/salesforce/scripts/fetch-schema.ts`.

This single script handles everything:
1. Authenticates via connection (`--connection-id`), direct token, or client credentials
2. Fetches the full GraphQL schema via introspection
3. Decodes HTML entities (`&quot;` → `"`, etc.)
4. Fixes empty enums that break codegen
5. Saves to the `--output` path

### Step 4: Copy Codegen Config

Copy from this skill's `scripts/codegen.ts` to `src/integrations/salesforce/scripts/codegen.ts`.

This TypeScript config generates a fully typed SDK using `graphql-request`.

### Step 5: Add Package Scripts

Use the `connection_id` from `get_connection_info` in the fetch-schema command:

```json
{
  "scripts": {
    "salesforce:fetch-schema": "npx tsx src/integrations/salesforce/scripts/fetch-schema.ts --connection-id <CONNECTION_ID> --output src/integrations/salesforce/schemas/schema-clean.json",
    "salesforce:codegen": "graphql-codegen --config src/integrations/salesforce/scripts/codegen.ts",
    "salesforce:refresh": "npm run salesforce:fetch-schema && npm run salesforce:codegen"
  }
}
```

Replace `<CONNECTION_ID>` with the actual `connection_id` returned by `get_connection_info`.

For projects with no known connection ID, use `--domain` instead:
```json
"salesforce:fetch-schema": "tsx src/integrations/salesforce/scripts/fetch-schema.ts --domain https://yourcompany.my.salesforce.com --output src/integrations/salesforce/schemas/schema-clean.json"
```

### Step 6: Fetch Schema

```bash
npm run salesforce:fetch-schema
```

This fetches your Salesforce GraphQL schema and creates a cleaned schema file at:
```
src/integrations/salesforce/schemas/schema-clean.json
```

This file is used by the codegen step to generate TypeScript types.

---

## Creating Operations

### Step 1: Define GraphQL Query

Create `src/integrations/salesforce/graphql/operations/<object>.graphql`:

```graphql
query GetLead($id: ID) {
  uiapi {
    query {
      Lead(where: { Id: { eq: $id } }, first: 1) {
        edges {
          node {
            Id
            Name { value }
            Email { value }
            Company { value }
            # Add fields as needed
          }
        }
      }
    }
  }
}
```

**GraphQL Field Syntax:**
- ID field: `Id` (no wrapper)
- Scalar fields: `FieldName { value }`
- Relationships: Skip or use `Account__r { Name { value } }`

### Step 2: Generate Typed SDK

```bash
npm run salesforce:codegen
```

This generates:
- `GetLeadQuery` - Typed query result
- `GetLeadQueryVariables` - Typed variables
- `getSdk()` - Factory function for typed client

---

## Client Setup

Create `src/integrations/salesforce/client.ts`:

```typescript
import { GraphQLClient } from "graphql-request";
import { getSdk, type Sdk } from "./generated/graphql.js";
import type { WorkflowContext } from "runcrayon";

const API_VERSION = "v59.0";

export async function makeSalesforceSdk(ctx: WorkflowContext): Promise<Sdk> {
  const conn = await ctx.getConnection("salesforce");
  const instanceUrl = conn.connectionConfig?.instance_url as string;
  if (!instanceUrl) {
    throw new Error("No instance_url in Salesforce connection config");
  }
  const client = new GraphQLClient(
    `${instanceUrl}/services/data/${API_VERSION}/graphql`,
    { headers: { Authorization: `Bearer ${conn.token}` } }
  );
  return getSdk(client);
}
```

---

## Creating Nodes

### Template: Get by ID

```typescript
// src/nodes/salesforce-get-<object>.ts
import { z } from "zod";
import { Node } from "runcrayon";
import { makeSalesforceSdk } from "../integrations/salesforce/client.js";
import type { Get<Object>Query } from "../integrations/salesforce/generated/graphql.js";

type <Object>Node = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<Get<Object>Query["uiapi"]["query"]["<Object>"]>["edges"]
    >[number]
  >["node"]
>;

function flatten<Object>Node(node: <Object>Node): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node)) {
    if (key === "Id") {
      result[key] = val;
    } else if (val && typeof val === "object" && "value" in val) {
      result[key] = val.value;
    }
  }
  return result;
}

export const salesforceGet<Object> = Node.create({
  name: "salesforce-get-<object>",
  integrations: ["salesforce"],
  inputSchema: z.object({
    id: z.string().describe("Salesforce <Object> ID"),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async (ctx, inputs) => {
    const sdk = await makeSalesforceSdk(ctx);
    const result = await sdk.Get<Object>({ id: inputs.id });

    const edges = result.uiapi.query.<Object>?.edges;
    if (!edges?.length || !edges[0]?.node) {
      throw new Error(`<Object> not found: ${inputs.id}`);
    }

    return flatten<Object>Node(edges[0].node);
  },
});
```

---

## Adding Fields

To add fields to an existing operation:

1. Edit the `.graphql` file in `graphql/operations/`
2. Run `npm run salesforce:codegen`
3. Types are automatically updated

---

## Common Objects & Fields

### Lead
```graphql
Id
Name { value }
FirstName { value }
LastName { value }
Email { value }
Phone { value }
Company { value }
Title { value }
Industry { value }
Status { value }
LeadSource { value }
CreatedDate { value }
```

### Account
```graphql
Id
Name { value }
Type { value }
Industry { value }
Website { value }
Phone { value }
NumberOfEmployees { value }
AnnualRevenue { value }
```

### Contact
```graphql
Id
Name { value }
FirstName { value }
LastName { value }
Email { value }
Phone { value }
Title { value }
AccountId { value }
```

### Opportunity
```graphql
Id
Name { value }
StageName { value }
Amount { value }
CloseDate { value }
Probability { value }
```

---

## Finding Custom Fields

List custom fields from the schema:

```bash
grep -oE "[A-Za-z0-9_]+__c" src/integrations/salesforce/schemas/schema-clean.json | sort -u | head -50
```

---

## Validation

After generating:

1. **Type check**: `npm run typecheck`
2. **Test query**: Call with a known ID
3. **Verify fields**: Check the flattened output has expected fields

---

## Example Session

```
User: I need to query Salesforce leads

Agent: I'm using the Salesforce integration skill.

[Pre-flight] No Salesforce SDK found. Setting up...

[Calls get_connection_info({ integration_id: "salesforce", workflow_name: "lead-enrichment", node_name: "salesforce-get-lead" })]
→ Got connection_id: acc5892d-...
→ Confirmed instance_url: https://mycompany.my.salesforce.com

Setting up schema and SDK...
- Created directory structure
- Fetched and cleaned schema (460 types, 1 empty enum fixed)
- Generated typed SDK

**Question:** Which fields do you need from Lead?

User: Name, Email, Company, Status, and any custom scoring fields

Agent: I'll create `src/integrations/salesforce/graphql/operations/lead.graphql`:

[Shows GraphQL query with requested fields]

Running codegen... Done.

**Question:** Should I create the node at `src/nodes/salesforce-get-lead.ts`?

User: Yes

Agent: Created typed node. Usage:

const lead = await sdk.GetLead({ id: "00Q..." });
// lead is fully typed with Name, Email, Company, Status, etc.

To add more fields later, edit `lead.graphql` and run `npm run salesforce:codegen`.
```
