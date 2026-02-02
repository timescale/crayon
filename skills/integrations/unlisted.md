# Unlisted Integrations

For external systems not covered by a specific integration file, follow this process to create a custom integration.

---

## Step 1: Research Available Options

Use web search to find available APIs, SDKs, and npm packages for the system. **Prefer options in this order:**

1. **TypeScript SDKs** (best: typed, easy to use)
2. **REST APIs with OpenAPI specs** (can generate typed clients)
3. **GraphQL APIs** (typed, flexible queries)
4. **REST APIs without OpenAPI specs** (least preferred: requires manual typing)

**For agent tools:** If this node will be used as a tool by an agent, also search for existing Vercel AI SDK integrations. The AI SDK has pre-built tools for many common services that can be used directly or adapted. Search for `"@ai-sdk" [system-name]` or check the Vercel AI SDK documentation.

Look for:
- Official documentation and API references
- npm package download counts and maintenance status
- Authentication methods (API key, OAuth2, etc.)
- Rate limits and usage restrictions

---

## Step 2: Present Options to User

Suggest 2-3 viable approaches with tradeoffs:

```
"For [system], I found these options:
  A) `[package-name]` - Official TypeScript SDK (recommended: typed, maintained)
  B) REST API with OpenAPI spec - Can generate typed client with openapi-typescript
  C) REST API - Manual implementation, requires defining types yourself

Which would you prefer?"
```

---

## Step 3: Gather Requirements

Ask follow-up questions:
- "Do you have existing credentials/authentication set up?"
- "Which specific endpoints or operations do you need?"
- "Any rate limit or caching considerations?"

---

## Step 4: Document in Node Spec

Add an `Integration:` section to the node spec with the chosen approach:

```markdown
**Integration:** Custom integration using `[package-name]` TypeScript SDK
- Package: `npm install [package-name]`
- Auth: API key via `[ENV_VAR]` environment variable
- Docs: [link to documentation]
```

This gives the compiler all the information needed to implement the node.
