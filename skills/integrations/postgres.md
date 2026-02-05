# PostgreSQL Integration

Guide for generating typed PostgreSQL query nodes using the `postgres` (postgres.js) library.

---

## Important: Schema-Driven Development

**Never guess at table names, column names, or data types.** Every database has different schemas.

During **node refinement** (`/0pflow:refine-node`), when a workflow needs database data:

1. **Announce:** "This node needs PostgreSQL data. I'll explore the database schema to see exactly which tables and columns are available."
2. Run the exploration commands below to discover the schema
3. Define in the spec:
   - Input/output schemas based on available columns
   - The exact SQL query to run (SELECT, INSERT, etc.)
4. **Validate SQL injection safety** - verify the query before adding to spec:
   - All user inputs use `${inputs.field}` syntax (parameterized by postgres.js)
   - Table and column names are hardcoded strings, never from user input
   - No string concatenation or interpolation outside of `sql` template literals
5. **STOP HERE during refinement** - do not proceed to creating the actual node

The actual query nodes are created later during `/0pflow:compile-workflow`, using the SQL query from the spec.

---

## Pre-Flight Checks

### 1. Check for psql

```bash
which psql
```

If not found, install it:
- **macOS:** `brew install libpq && brew link --force libpq`
- **Ubuntu/Debian:** `sudo apt-get install postgresql-client`
- **Fedora/RHEL:** `sudo dnf install postgresql`

### 2. Check for Existing Client Setup

Look for `src/integrations/postgres/client.ts`. If it exists, the client is ready.

If not: "I don't see a PostgreSQL client in your project. Would you like me to set it up?"

### 3. Check for Credentials

**Ask the user:** "Which environment variable in your `.env` file contains the PostgreSQL connection string for this integration?"

Common options:
- `DATABASE_URL` - often the app's own database
- `POSTGRES_URL` - general purpose
- `<SERVICE>_DATABASE_URL` - service-specific (e.g., `ANALYTICS_DATABASE_URL`)

If the user hasn't set one up yet, ask them to add it to `.env`:
```
ANALYTICS_DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

Record the chosen variable name in the spec. The generated client will use this variable.

### 4. Check for Dependencies

The project already includes `postgres` (postgres.js). No additional dependencies needed.

---

## Schema Exploration

Use these commands to explore the database schema dynamically. No pre-generation needed.

First, load the env var from `.env`:
```bash
export $(grep ANALYTICS_DATABASE_URL .env | xargs)
```

Then replace `$ENV_VAR` in the commands below with the actual variable (e.g., `$ANALYTICS_DATABASE_URL`).

### List All Schemas

```bash
psql $ENV_VAR -c '\dn'
```

### List All Tables

```bash
psql $ENV_VAR -c '\dt' # all tables in schemas in search_path
psql $ENV_VAR -c '\dt myschema.*' # all tables in a specific schema
```

### Search Tables by Keyword

```bash
psql $ENV_VAR -c '\dt *user*' # all tables containing "user" in any schema in search_path
psql $ENV_VAR -c '\dt myschema.*user*' # all tables containing "user" in a specific schema
```

### Search Columns by Keyword

```bash
psql $ENV_VAR -c "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE column_name LIKE '%email%';"
```

### Describe a Table

```bash
psql $ENV_VAR -c '\d users'
```

### Find Foreign Keys

```bash
psql $ENV_VAR -c '\d+ users'
```

### Sample Data

```bash
psql $ENV_VAR -c 'SELECT * FROM users LIMIT 3;'
```

---

## Directory Structure

```
src/integrations/postgres/
└── client.ts           # Database client factory
```

That's it - no generated files needed.

---

## Client Setup

Create `src/integrations/postgres/client.ts`:

```typescript
// src/integrations/postgres/client.ts
// Replace <ENV_VAR> with the environment variable from the spec (e.g., ANALYTICS_DATABASE_URL)
import postgres from "postgres";
import { config } from "dotenv";
import findConfig from "find-config";

const envPath = findConfig(".env");
if (envPath) config({ path: envPath });

const DATABASE_URL = process.env.<ENV_VAR>;
if (!DATABASE_URL) {
  throw new Error("<ENV_VAR> environment variable is required");
}

// Shared connection pool
let sqlInstance: postgres.Sql | null = null;

export function getPostgresClient(): postgres.Sql {
  if (!sqlInstance) {
    sqlInstance = postgres(DATABASE_URL, {
      max: 10, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sqlInstance;
}

// For graceful shutdown
export async function closePostgresClient(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end();
    sqlInstance = null;
  }
}
```

---

## Creating Nodes

These are **code-generation templates**. Replace `<table>` and `<Table>` with actual names when creating nodes (e.g., `users` and `"Users"`). The table name becomes a hardcoded string in the generated code, not a runtime variable.

**Note:** PostgreSQL lowercases unquoted identifiers. If a table uses uppercase (e.g., `Users`), quote it in SQL: `"Users"`. Prefer lowercase table names to avoid this.

All `${value}` expressions use postgres.js tagged template literals, which automatically parameterize values to prevent SQL injection.

### Template: Query by ID

```typescript
// src/nodes/postgres-get-<table>.ts
import { z } from "zod";
import { Node } from "0pflow";
import { getPostgresClient } from "../integrations/postgres/client.js";

export const postgresGet<Table> = Node.create({
  name: "postgres-get-<table>",
  inputSchema: z.object({
    id: z.string().describe("<Table> ID"),
  }),
  outputSchema: z.object({
    // Define based on explored schema
    id: z.string(),
    name: z.string(),
    created_at: z.string(),
    // ... other columns
  }).nullable(),
  execute: async (_ctx, inputs) => {
    const sql = getPostgresClient();

    const rows = await sql`
      SELECT *
      FROM <table>
      WHERE id = ${inputs.id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  },
});
```

### Template: Query with Filters

```typescript
// src/nodes/postgres-list-<table>.ts
import { z } from "zod";
import { Node } from "0pflow";
import { getPostgresClient } from "../integrations/postgres/client.js";

export const postgresList<Table> = Node.create({
  name: "postgres-list-<table>",
  inputSchema: z.object({
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
    // Add filter fields as needed
    status: z.string().optional(),
  }),
  outputSchema: z.object({
    rows: z.array(z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      // ... other columns
    })),
    total: z.number(),
  }),
  execute: async (_ctx, inputs) => {
    const sql = getPostgresClient();

    // Build query with optional filters
    const rows = await sql`
      SELECT *
      FROM <table>
      ${inputs.status ? sql`WHERE status = ${inputs.status}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${inputs.limit}
      OFFSET ${inputs.offset}
    `;

    const [{ count }] = await sql`
      SELECT COUNT(*) as count
      FROM <table>
      ${inputs.status ? sql`WHERE status = ${inputs.status}` : sql``}
    `;

    return {
      rows,
      total: Number(count),
    };
  },
});
```

### Template: Insert Row

```typescript
// src/nodes/postgres-create-<table>.ts
import { z } from "zod";
import { Node } from "0pflow";
import { getPostgresClient } from "../integrations/postgres/client.js";

export const postgresCreate<Table> = Node.create({
  name: "postgres-create-<table>",
  inputSchema: z.object({
    name: z.string(),
    // ... other required columns
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    created_at: z.string(),
    // ... return the created row
  }),
  execute: async (_ctx, inputs) => {
    const sql = getPostgresClient();

    const [row] = await sql`
      INSERT INTO <table> (name)
      VALUES (${inputs.name})
      RETURNING *
    `;

    return row;
  },
});
```

---

## PostgreSQL Type Mapping

| PostgreSQL Type | Zod Schema |
|----------------|------------|
| `integer`, `bigint`, `smallint` | `z.number()` |
| `real`, `double precision`, `numeric` | `z.number()` |
| `text`, `varchar`, `char` | `z.string()` |
| `boolean` | `z.boolean()` |
| `timestamp`, `timestamptz` | `z.string()` (ISO format) |
| `date` | `z.string()` (YYYY-MM-DD) |
| `uuid` | `z.string().uuid()` |
| `json`, `jsonb` | `z.unknown()` or specific schema |
| `text[]`, `integer[]` | `z.array(z.string())`, `z.array(z.number())` |

---

## Example Session

```
User: I need to query the users table in my database

Agent: I'm using the PostgreSQL integration skill.

[Pre-flight] Checking for psql... Found.
[Pre-flight] Checking for PostgreSQL client... Not found.

**Question:** Which environment variable contains the PostgreSQL connection string?

User: ANALYTICS_DATABASE_URL

Agent: I'll use `ANALYTICS_DATABASE_URL` and record it in the spec.

**Exploring database:**
$ psql $ANALYTICS_DATABASE_URL -c '\dt'

 Schema |   Name   | Type
--------+----------+-------
 public | users    | table
 public | orders   | table
 public | products | table

$ psql $ENV_VAR -c '\d users'

   Column   |           Type           | Nullable |    Default
------------+--------------------------+----------+----------------
 id         | uuid                     | not null | gen_random_uuid()
 email      | text                     | not null |
 name       | text                     |          |
 created_at | timestamp with time zone | not null | now()
 status     | text                     |          | 'active'

**Question:** Which operation do you need?
1. Get user by ID
2. List users with filters
3. Create user

User: Get user by ID

Agent: I'll define the node spec with:
- Input: `id` (string, uuid)
- Output: `{ id, email, name, created_at, status }` or null
- SQL:
  ```sql
  SELECT id, email, name, created_at, status
  FROM users
  WHERE id = ${inputs.id}
  LIMIT 1
  ```

[Updates workflow spec with node definition including the SQL query]
```

---

## Security Notes

1. **Always use parameterized queries** - postgres.js template literals automatically escape values
2. **Never interpolate user input into SQL** - use `${value}` syntax only
3. **Whitelist table/column names** - if using dynamic table names, validate against known tables
4. **Use least-privilege credentials** - create read-only users for query-only nodes
