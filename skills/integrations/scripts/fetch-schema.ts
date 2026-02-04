// fetch-schema.ts
// Fetches and cleans the Salesforce GraphQL schema
// Supports two authentication methods (via environment variables):
//   1. Direct access token: SALESFORCE_ACCESS_TOKEN (from Nango or other OAuth provider)
//   2. Client credentials: SALESFORCE_CLIENT_ID + SALESFORCE_CLIENT_SECRET
//
// - Fetches schema via introspection
// - Decodes HTML entities (&quot;, &amp;, etc.)
// - Fixes empty enums that break graphql-codegen
//
// Usage: npx tsx fetch-schema.ts [salesforce-domain] [output-path]
//
// Environment variables:
//   SALESFORCE_DOMAIN         - Salesforce instance URL (can also be passed as first arg)
//   SALESFORCE_ACCESS_TOKEN   - Direct access token (takes priority if set)
//   SALESFORCE_CLIENT_ID      - Client ID for client credentials flow
//   SALESFORCE_CLIENT_SECRET  - Client secret for client credentials flow
//
// Examples:
//   # With direct access token
//   SALESFORCE_ACCESS_TOKEN=00D... npx tsx fetch-schema.ts https://mycompany.my.salesforce.com
//
//   # With client credentials (reads from .env)
//   npx tsx fetch-schema.ts https://mycompany.my.salesforce.com

import { config } from "dotenv";
import findConfig from "find-config";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { getIntrospectionQuery } from "graphql";
import he from "he";

// Load .env from current or parent directories
const envPath = findConfig(".env");
if (envPath) {
  console.log(`Loading environment from ${envPath}`);
  config({ path: envPath });
} else {
  console.log("No .env file found, using existing environment variables");
}

const SALESFORCE_DOMAIN = process.argv[2] || process.env.SALESFORCE_DOMAIN || "";
const OUTPUT_PATH = process.argv[3] || "schemas/schema-clean.json";

interface EnumValue {
  name: string;
  description: string | null;
  isDeprecated: boolean;
  deprecationReason: string | null;
}

interface SchemaType {
  kind: string;
  name: string;
  enumValues: EnumValue[] | null;
}

function decodeHtmlEntities(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];

    if (typeof value === "string") {
      (obj as Record<string, unknown>)[key] = he.decode(value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => decodeHtmlEntities(item));
    } else if (typeof value === "object") {
      decodeHtmlEntities(value);
    }
  }
}

function fixEmptyEnums(schema: { data: { __schema: { types: SchemaType[] } } }): number {
  let fixed = 0;
  for (const type of schema.data.__schema.types) {
    if (type.kind === "ENUM" && (type.enumValues === null || type.enumValues.length === 0)) {
      type.enumValues = [{
        name: "_EMPTY",
        description: "Placeholder for empty enum",
        isDeprecated: true,
        deprecationReason: "Empty enum placeholder"
      }];
      fixed++;
      console.log(`  Fixed empty enum: ${type.name}`);
    }
  }
  return fixed;
}

if (!SALESFORCE_DOMAIN) {
  console.error(`
Usage: npx tsx fetch-schema.ts [salesforce-domain] [output-path]

Environment variables (set in .env or environment):
  SALESFORCE_DOMAIN          Salesforce instance URL (or pass as first argument)

Authentication (one of the following):
  SALESFORCE_ACCESS_TOKEN    Direct access token (from Nango, etc.) - takes priority
  SALESFORCE_CLIENT_ID +     Client credentials OAuth flow
  SALESFORCE_CLIENT_SECRET

Examples:
  # With direct access token
  SALESFORCE_ACCESS_TOKEN=00D... npx tsx fetch-schema.ts https://mycompany.my.salesforce.com

  # With client credentials (from .env)
  npx tsx fetch-schema.ts https://mycompany.my.salesforce.com
`);
  process.exit(1);
}

async function getAccessTokenViaClientCredentials(): Promise<{ accessToken: string; instanceUrl: string }> {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "No authentication method available.\n" +
      "Set SALESFORCE_ACCESS_TOKEN for direct token auth, or\n" +
      "Set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET for client credentials flow."
    );
  }

  console.log("Using client credentials OAuth flow...");
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
    throw new Error(`OAuth failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; instance_url?: string };
  return {
    accessToken: data.access_token,
    instanceUrl: data.instance_url || SALESFORCE_DOMAIN,
  };
}

async function getAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  // Method 1: Direct access token (from Nango or other OAuth provider)
  const directToken = process.env.SALESFORCE_ACCESS_TOKEN;
  if (directToken) {
    console.log("Using direct access token (SALESFORCE_ACCESS_TOKEN)...");
    return {
      accessToken: directToken,
      instanceUrl: SALESFORCE_DOMAIN,
    };
  }

  // Method 2: Client credentials OAuth flow
  return getAccessTokenViaClientCredentials();
}

async function fetchGraphQLSchema(accessToken: string, instanceUrl: string): Promise<unknown> {
  const introspectionQuery = getIntrospectionQuery();

  const response = await fetch(`${instanceUrl}/services/data/v59.0/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: introspectionQuery }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL introspection failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  console.log(`Salesforce domain: ${SALESFORCE_DOMAIN}`);
  console.log("Getting access token...");
  const { accessToken, instanceUrl } = await getAccessToken();
  console.log(`Got token, instance URL: ${instanceUrl}`);

  console.log("Fetching GraphQL schema...");
  const schema = await fetchGraphQLSchema(accessToken, instanceUrl) as { data: { __schema: { types: SchemaType[] } } };

  console.log("Decoding HTML entities...");
  decodeHtmlEntities(schema);

  console.log("Fixing empty enums...");
  const fixedCount = fixEmptyEnums(schema);
  if (fixedCount === 0) {
    console.log("  No empty enums found");
  }

  // Ensure output directory exists
  const outputDir = OUTPUT_PATH.substring(0, OUTPUT_PATH.lastIndexOf("/"));
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(schema, null, 2));
  console.log(`Cleaned schema saved to ${OUTPUT_PATH}`);

  // Verify JSON is valid
  JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
  console.log("JSON validation passed");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
