// codegen.ts
// GraphQL Codegen config for Salesforce - generates typed SDK with graphql-request
//
// Usage: npx graphql-codegen --config src/integrations/salesforce/scripts/codegen.ts

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/integrations/salesforce/schemas/schema-clean.json",
  documents: "src/integrations/salesforce/graphql/operations/**/*.graphql",
  generates: {
    "src/integrations/salesforce/generated/graphql.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
      config: {
        avoidOptionals: false,
        enumsAsTypes: true,
        skipTypename: true,
        // Only generate types for operations we define (not entire schema)
        onlyOperationTypes: true,
        // Use type-only imports for TypeScript verbatimModuleSyntax
        useTypeImports: true,
      },
    },
  },
};

export default config;
