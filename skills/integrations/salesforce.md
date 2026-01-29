# Salesforce Integration

Guide for generating typed Salesforce query nodes using GraphQL with `graphql-request` and `graphql-codegen`.

---

## Pre-Flight Checks

### 1. Check for Existing Setup

Look for `src/integrations/salesforce/generated/graphql.ts`. If it exists, the typed SDK is ready.

If not: "I don't see a Salesforce SDK in your project. Would you like me to set it up?"

### 2. Check for Credentials

Required environment variables in `.env`:
- `SALESFORCE_DOMAIN` (e.g., `https://yourcompany.my.salesforce.com`)
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`

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

### Step 1: Get Salesforce Domain

Ask: "What is your Salesforce domain?"
- Production: `https://yourcompany.my.salesforce.com`
- Sandbox: `https://yourcompany--sandbox.sandbox.my.salesforce.com`

Add to `.env`:
```
SALESFORCE_DOMAIN=https://yourcompany.my.salesforce.com
```

### Step 2: Create Directory Structure

```bash
mkdir -p src/integrations/salesforce/{scripts,schemas,graphql/operations,generated}
```

### Step 3: Copy fetch-schema.ts

Copy from this skill's `scripts/fetch-schema.ts` to `src/integrations/salesforce/scripts/fetch-schema.ts`.

This single script handles everything:
1. Authenticates via OAuth client credentials
2. Fetches the full GraphQL schema via introspection
3. Decodes HTML entities (`&quot;` → `"`, etc.)
4. Fixes empty enums that break codegen
5. Saves to `schemas/schema-clean.json`

### Step 4: Copy Codegen Config

Copy from this skill's `scripts/codegen.ts` to `src/integrations/salesforce/scripts/codegen.ts`.

This TypeScript config generates a fully typed SDK using `graphql-request`.

### Step 5: Add Package Scripts

```json
{
  "scripts": {
    "salesforce:fetch-schema": "tsx src/integrations/salesforce/scripts/fetch-schema.ts '' src/integrations/salesforce/schemas/schema-clean.json",
    "salesforce:codegen": "graphql-codegen --config src/integrations/salesforce/scripts/codegen.ts",
    "salesforce:refresh": "npm run salesforce:fetch-schema && npm run salesforce:codegen"
  }
}
```

### Step 6: Fetch Schema

```bash
npm run salesforce:fetch-schema
```

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
import { config } from "dotenv";
import findConfig from "find-config";

const envPath = findConfig(".env");
if (envPath) config({ path: envPath });

const SALESFORCE_DOMAIN = process.env.SALESFORCE_DOMAIN!;
const API_VERSION = "v59.0";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET must be set");
  }

  const response = await fetch(`${SALESFORCE_DOMAIN}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Salesforce OAuth failed: ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getCachedAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 5 * 60 * 1000) {
    return cachedToken.token;
  }
  const token = await getAccessToken();
  cachedToken = { token, expiresAt: now + 115 * 60 * 1000 };
  return token;
}

export async function makeSalesforceSdk(): Promise<Sdk> {
  const token = await getCachedAccessToken();
  const client = new GraphQLClient(
    `${SALESFORCE_DOMAIN}/services/data/${API_VERSION}/graphql`,
    { headers: { Authorization: `Bearer ${token}` } }
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
import { Node } from "0pflow";
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
  inputSchema: z.object({
    id: z.string().describe("Salesforce <Object> ID"),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async (_ctx, inputs) => {
    const sdk = await makeSalesforceSdk();
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

**Question 1:** What is your Salesforce domain?

User: https://mycompany.my.salesforce.com

Agent: I'll add that to your .env file.

Setting up schema and SDK...
- Created directory structure
- Fetched and cleaned schema (460 types, 1 empty enum fixed)
- Generated typed SDK

**Question 2:** Which fields do you need from Lead?

User: Name, Email, Company, Status, and any custom scoring fields

Agent: I'll create `src/integrations/salesforce/graphql/operations/lead.graphql`:

[Shows GraphQL query with requested fields]

Running codegen... Done.

**Question 3:** Should I create the node at `src/nodes/salesforce-get-lead.ts`?

User: Yes

Agent: Created typed node. Usage:

const lead = await sdk.GetLead({ id: "00Q..." });
// lead is fully typed with Name, Email, Company, Status, etc.

To add more fields later, edit `lead.graphql` and run `npm run salesforce:codegen`.
```
