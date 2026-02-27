// codegen.ts
// GraphQL Codegen config for Salesforce - generates typed SDK with graphql-request
//
// Usage: npx graphql-codegen --config src/crayon/integrations/salesforce/scripts/codegen.ts

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/crayon/integrations/salesforce/schemas/schema-clean.json",
  documents: "src/crayon/integrations/salesforce/graphql/operations/**/*.graphql",
  generates: {
    "src/crayon/integrations/salesforce/generated/graphql.ts": {
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
