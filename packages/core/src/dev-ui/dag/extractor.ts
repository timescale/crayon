import type { DAGNode, DAGEdge, WorkflowDAG, LoopGroup } from "./types.js";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";

// web-tree-sitter types
type Parser = {
  parse(input: string): Tree;
  setLanguage(lang: Language): void;
  delete(): void;
};
type Language = unknown;
type Tree = { rootNode: SyntaxNode };
type SyntaxNode = {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  children: SyntaxNode[];
  namedChildren: SyntaxNode[];
  child(index: number): SyntaxNode | null;
  namedChild(index: number): SyntaxNode | null;
  childForFieldName(name: string): SyntaxNode | null;
  descendantsOfType(type: string): SyntaxNode[];
  parent: SyntaxNode | null;
};

let parserReady: Promise<Parser | null> | null = null;

async function getParser(): Promise<Parser | null> {
  if (parserReady) return parserReady;

  parserReady = (async () => {
    try {
      const TreeSitter = (await import("web-tree-sitter")).default;
      await TreeSitter.init();

      const require = createRequire(import.meta.url);
      const tsPkgJson = require.resolve("tree-sitter-typescript/package.json");
      const wasmPath = resolve(dirname(tsPkgJson), "tree-sitter-typescript.wasm");

      const TypeScript = await TreeSitter.Language.load(wasmPath);
      const parser = new TreeSitter();
      parser.setLanguage(TypeScript);
      return parser as unknown as Parser;
    } catch {
      return null;
    }
  })();

  return parserReady;
}

interface ImportInfo {
  identifier: string;
  source: string;
}

/**
 * Determine executable type from import path.
 */
function inferType(importSource: string): DAGNode["type"] {
  if (importSource === "0pflow" || importSource === "0pflow/nodes") return "node";
  if (importSource.includes("agents/")) return "agent";
  if (importSource.includes("workflows/")) return "workflow";
  if (importSource.includes("nodes/")) return "node";
  return "node";
}

/**
 * Convert a camelCase or PascalCase identifier to a human-readable label.
 * e.g. "querySalesforceLeads" → "Query Salesforce Leads"
 *      "pageSummarizer" → "Page Summarizer"
 *      "webRead" → "Web Read"
 */
function humanize(identifier: string): string {
  // Insert spaces before uppercase letters (camelCase → camel Case)
  const spaced = identifier.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  // Capitalize first letter
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function extractStringProperty(obj: SyntaxNode, propName: string): string | null {
  for (const prop of obj.namedChildren) {
    if (prop.type === "pair" || prop.type === "property_assignment") {
      const key = prop.namedChildren[0];
      const value = prop.namedChildren[1];
      if (key?.text === propName && value) {
        if (value.type === "template_string") {
          // Strip backticks
          return value.text.replace(/^`|`$/g, "").trim();
        }
        if (value.type === "string") {
          return value.text.replace(/^['"]|['"]$/g, "").trim();
        }
      }
    }
  }
  return null;
}

/**
 * Extract a string array property (e.g. integrations: ["salesforce", "hubspot"]) from an object node.
 */
function extractStringArrayProperty(obj: SyntaxNode, propName: string): string[] | null {
  for (const prop of obj.namedChildren) {
    if (prop.type === "pair" || prop.type === "property_assignment") {
      const key = prop.namedChildren[0];
      const value = prop.namedChildren[1];
      if (key?.text === propName && value?.type === "array") {
        const items: string[] = [];
        for (const elem of value.namedChildren) {
          if (elem.type === "string") {
            items.push(elem.text.replace(/^['"]|['"]$/g, ""));
          }
        }
        return items.length > 0 ? items : null;
      }
    }
  }
  return null;
}

/**
 * Parse a node source file and extract the integrations array from its .create() config.
 */
export async function extractNodeIntegrations(source: string): Promise<string[] | undefined> {
  const parser = await getParser();
  if (!parser) return undefined;
  const tree = parser.parse(source);
  const root = tree.rootNode;

  const calls = root.descendantsOfType("call_expression");
  for (const call of calls) {
    const fn = call.namedChildren[0];
    if (!fn || fn.type !== "member_expression") continue;
    const prop = fn.namedChildren[1];
    if (prop?.text !== "create") continue;

    const args = call.descendantsOfType("arguments")[0];
    if (!args) continue;

    const obj = args.descendantsOfType("object")[0];
    if (!obj) continue;

    const integrations = extractStringArrayProperty(obj, "integrations");
    if (integrations) return integrations;
  }

  return undefined;
}

/**
 * Parse a node source file and extract the name from its .create() config.
 */
export async function extractNodeName(source: string): Promise<string | undefined> {
  const parser = await getParser();
  if (!parser) return undefined;
  const tree = parser.parse(source);
  const root = tree.rootNode;

  const calls = root.descendantsOfType("call_expression");
  for (const call of calls) {
    const fn = call.namedChildren[0];
    if (!fn || fn.type !== "member_expression") continue;
    const prop = fn.namedChildren[1];
    if (prop?.text !== "create") continue;

    const args = call.descendantsOfType("arguments")[0];
    if (!args) continue;

    const obj = args.descendantsOfType("object")[0];
    if (!obj) continue;

    const name = extractStringProperty(obj, "name");
    if (name) return name;
  }

  return undefined;
}

/**
 * Parse a node source file and extract the description from its .create() config.
 */
export async function extractNodeDescription(source: string): Promise<string | undefined> {
  const parser = await getParser();
  if (!parser) return undefined;
  const tree = parser.parse(source);
  const root = tree.rootNode;

  // Find any .create() call
  const calls = root.descendantsOfType("call_expression");
  for (const call of calls) {
    const fn = call.namedChildren[0];
    if (!fn || fn.type !== "member_expression") continue;
    const prop = fn.namedChildren[1];
    if (prop?.text !== "create") continue;

    const args = call.descendantsOfType("arguments")[0];
    if (!args) continue;

    const obj = args.descendantsOfType("object")[0];
    if (!obj) continue;

    const desc = extractStringProperty(obj, "description");
    if (desc) return desc;
  }

  return undefined;
}

function extractImports(root: SyntaxNode): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>();
  const importStatements = root.descendantsOfType("import_statement");

  for (const stmt of importStatements) {
    const sourceNode = stmt.descendantsOfType("string")[0];
    if (!sourceNode) continue;
    const source = sourceNode.text.replace(/^['"]|['"]$/g, "");

    const importSpecifiers = stmt.descendantsOfType("import_specifier");
    for (const spec of importSpecifiers) {
      const names = spec.namedChildren;
      const identifier = names.length > 1 ? names[1].text : names[0]?.text;
      if (identifier) {
        imports.set(identifier, { identifier, source });
      }
    }

    const identifiers = stmt.descendantsOfType("identifier");
    for (const id of identifiers) {
      if (id.parent?.type === "import_clause") {
        imports.set(id.text, { identifier: id.text, source });
      }
    }
  }

  return imports;
}

function findWorkflowCreateCalls(root: SyntaxNode): SyntaxNode[] {
  const calls = root.descendantsOfType("call_expression");
  const results: SyntaxNode[] = [];

  for (const call of calls) {
    const fn = call.namedChildren[0];
    if (!fn) continue;

    if (fn.type === "member_expression") {
      const obj = fn.namedChildren[0];
      const prop = fn.namedChildren[1];
      if (obj?.text === "Workflow" && prop?.text === "create") {
        results.push(call);
      }
    }
  }

  return results;
}

function extractWorkflowName(createCall: SyntaxNode): string | null {
  const args = createCall.descendantsOfType("arguments")[0];
  if (!args) return null;

  const obj = args.descendantsOfType("object")[0];
  if (!obj) return null;

  for (const prop of obj.namedChildren) {
    if (prop.type === "pair" || prop.type === "property_assignment") {
      const key = prop.namedChildren[0];
      const value = prop.namedChildren[1];
      if (key?.text === "name" && value) {
        return value.text.replace(/^['"]|['"]$/g, "");
      }
    }
  }

  return null;
}

function extractWorkflowVersion(createCall: SyntaxNode): number {
  const args = createCall.descendantsOfType("arguments")[0];
  if (!args) return 1;

  const obj = args.descendantsOfType("object")[0];
  if (!obj) return 1;

  for (const prop of obj.namedChildren) {
    if (prop.type === "pair" || prop.type === "property_assignment") {
      const key = prop.namedChildren[0];
      const value = prop.namedChildren[1];
      if (key?.text === "version" && value) {
        const n = parseInt(value.text, 10);
        return isNaN(n) ? 1 : n;
      }
    }
  }

  return 1;
}

/**
 * Extract field names from a z.object({...}) schema variable.
 * Given the schema variable name (e.g. "UrlSummarizerInputSchema"),
 * find its declaration and extract the top-level keys from z.object({...}).
 */
function extractSchemaFields(root: SyntaxNode, schemaVarName: string): string[] {
  // Find variable declaration: const <name> = z.object({...})
  const declarations = root.descendantsOfType("variable_declarator");
  for (const decl of declarations) {
    const nameNode = decl.namedChildren[0];
    if (nameNode?.text !== schemaVarName) continue;

    // Find the z.object call in the initializer
    const calls = decl.descendantsOfType("call_expression");
    for (const call of calls) {
      const fn = call.namedChildren[0];
      if (!fn || fn.type !== "member_expression") continue;
      if (fn.namedChildren[0]?.text !== "z" || fn.namedChildren[1]?.text !== "object") continue;

      // Found z.object(...) — extract keys from the object argument
      const args = call.descendantsOfType("arguments")[0];
      if (!args) continue;

      const obj = args.descendantsOfType("object")[0];
      if (!obj) continue;

      const fields: string[] = [];
      for (const prop of obj.namedChildren) {
        if (prop.type === "pair" || prop.type === "property_assignment") {
          const key = prop.namedChildren[0];
          if (key) fields.push(key.text);
        }
        if (prop.type === "shorthand_property_identifier" || prop.type === "shorthand_property_identifier_pattern") {
          fields.push(prop.text);
        }
      }
      return fields;
    }
  }
  return [];
}

/**
 * Get the schema variable name from the Workflow.create() config object.
 * Looks for inputSchema/outputSchema property values.
 */
function getSchemaVarName(createCall: SyntaxNode, propName: string): string | null {
  const args = createCall.descendantsOfType("arguments")[0];
  if (!args) return null;

  const obj = args.descendantsOfType("object")[0];
  if (!obj) return null;

  for (const prop of obj.namedChildren) {
    if (prop.type === "pair" || prop.type === "property_assignment") {
      const key = prop.namedChildren[0];
      const value = prop.namedChildren[1];
      if (key?.text === propName && value) {
        return value.text;
      }
    }
  }

  return null;
}

function findRunMethod(createCall: SyntaxNode): SyntaxNode | null {
  const args = createCall.descendantsOfType("arguments")[0];
  if (!args) return null;

  const obj = args.descendantsOfType("object")[0];
  if (!obj) return null;

  for (const prop of obj.namedChildren) {
    if (prop.type === "method_definition") {
      const nameNode = prop.childForFieldName("name");
      if (nameNode?.text === "run") return prop;
    }
    if (prop.type === "pair" || prop.type === "property_assignment") {
      const key = prop.namedChildren[0];
      if (key?.text === "run") {
        return prop;
      }
    }
  }

  return null;
}

function getContextParamName(runMethod: SyntaxNode): string {
  const params = runMethod.descendantsOfType("formal_parameters")[0];
  if (!params) return "ctx";

  const firstParam = params.namedChildren[0];
  if (!firstParam) return "ctx";

  if (firstParam.type === "required_parameter" || firstParam.type === "optional_parameter") {
    const pattern = firstParam.childForFieldName("pattern");
    return pattern?.text ?? firstParam.namedChildren[0]?.text ?? "ctx";
  }

  return firstParam.text ?? "ctx";
}

interface CtxRunCall {
  executableIdentifier: string;
  lineNumber: number;
  node: SyntaxNode;
}

function extractCtxRunCalls(body: SyntaxNode, ctxName: string): CtxRunCall[] {
  const calls: CtxRunCall[] = [];
  const allCalls = body.descendantsOfType("call_expression");

  for (const call of allCalls) {
    const fn = call.namedChildren[0];
    if (!fn || fn.type !== "member_expression") continue;

    const obj = fn.namedChildren[0];
    const prop = fn.namedChildren[1];
    if (obj?.text !== ctxName || prop?.text !== "run") continue;

    const args = call.descendantsOfType("arguments")[0];
    if (!args) continue;

    const firstArg = args.namedChildren[0];
    if (!firstArg) continue;

    calls.push({
      executableIdentifier: firstArg.text,
      lineNumber: call.startPosition.row + 1,
      node: call,
    });
  }

  return calls;
}

const LOOP_TYPES = new Set([
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
]);

function findEnclosingLoop(callNode: SyntaxNode, runMethodBody: SyntaxNode): SyntaxNode | null {
  let current: SyntaxNode | null = callNode;
  while (current && current !== runMethodBody) {
    if (LOOP_TYPES.has(current.type)) return current;
    current = current.parent;
  }
  return null;
}

function extractLoopLabel(loopNode: SyntaxNode): string {
  if (loopNode.type === "for_in_statement") {
    // Covers for...of and for...in
    // Structure: for (const <var> of/in <iterable>) { ... }
    const left = loopNode.childForFieldName("left");
    const right = loopNode.childForFieldName("right");
    // Determine if it's "of" or "in" by checking the text between left and right
    const keyword = loopNode.text.includes(" of ") ? "of" : "in";
    const varName = left?.text.replace(/^(const|let|var)\s+/, "") ?? "item";
    const iterableName = right?.text ?? "items";
    return `for each ${varName} ${keyword} ${iterableName}`;
  }
  if (loopNode.type === "while_statement") {
    const condition = loopNode.childForFieldName("condition");
    return `while ${condition?.text ?? "(...)"}`;
  }
  // for_statement, do_statement
  return "for loop";
}

function getEnclosingIfCondition(
  callNode: SyntaxNode,
  runMethodBody: SyntaxNode,
): { condition: string; isElseBranch: boolean } | null {
  let current: SyntaxNode | null = callNode;

  while (current && current !== runMethodBody) {
    if (current.type === "if_statement") {
      const condition = current.childForFieldName("condition");
      const consequence = current.childForFieldName("consequence");
      const alternative = current.childForFieldName("alternative");

      const isInConsequence = consequence && isDescendantOf(callNode, consequence);
      const isInAlternative = alternative && isDescendantOf(callNode, alternative);

      return {
        condition: condition?.text ?? "?",
        isElseBranch: !isInConsequence && !!isInAlternative,
      };
    }
    current = current.parent;
  }

  return null;
}

function isDescendantOf(node: SyntaxNode, ancestor: SyntaxNode): boolean {
  let current: SyntaxNode | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isFollowedByReturn(
  callNode: SyntaxNode,
  runMethodBody: SyntaxNode,
): boolean {
  let stmt: SyntaxNode | null = callNode;
  while (stmt && stmt.type !== "expression_statement" && stmt !== runMethodBody) {
    stmt = stmt.parent;
  }
  if (!stmt || stmt === runMethodBody) return false;

  const parent = stmt.parent;
  if (!parent) return false;

  const children = parent.namedChildren;
  const idx = children.indexOf(stmt);
  if (idx < 0 || idx >= children.length - 1) return false;

  const next = children[idx + 1];
  return next?.type === "return_statement";
}

interface GuardClause {
  condition: string;
  lineNumber: number;
}

function findGuardClausesBetween(
  runBody: SyntaxNode,
  afterLine: number,
  beforeLine: number,
): GuardClause[] {
  const guards: GuardClause[] = [];

  for (const child of runBody.namedChildren) {
    const line = child.startPosition.row + 1;
    if (line <= afterLine || line >= beforeLine) continue;

    if (child.type === "if_statement") {
      const consequence = child.childForFieldName("consequence");
      if (!consequence) continue;

      const returns = consequence.descendantsOfType("return_statement");
      if (returns.length > 0) {
        const condition = child.childForFieldName("condition");
        guards.push({
          condition: condition?.text ?? "?",
          lineNumber: line,
        });
      }
    }
  }

  return guards;
}

/**
 * Parse a single TypeScript file and extract workflow DAGs from it.
 * Fault-tolerant: returns whatever it can parse, even from broken files.
 */
export async function extractDAGs(
  filePath: string,
  source: string,
): Promise<WorkflowDAG[]> {
  const parser = await getParser();
  if (!parser) return [];
  const tree = parser.parse(source);
  const root = tree.rootNode;

  const imports = extractImports(root);
  const workflowCalls = findWorkflowCreateCalls(root);
  const dags: WorkflowDAG[] = [];

  // Fallback for broken files: if no complete Workflow.create() call found,
  // look for a Workflow.create member expression + any ctx.run() calls in the file
  if (workflowCalls.length === 0) {
    const memberExprs = root.descendantsOfType("member_expression");
    const hasWorkflowCreate = memberExprs.some(
      (m) => m.namedChildren[0]?.text === "Workflow" && m.namedChildren[1]?.text === "create",
    );

    if (hasWorkflowCreate) {
      const allCalls = root.descendantsOfType("call_expression");
      const ctxRunCalls: CtxRunCall[] = [];

      for (const call of allCalls) {
        const fn = call.namedChildren[0];
        if (!fn || fn.type !== "member_expression") continue;
        const prop = fn.namedChildren[1];
        if (prop?.text !== "run") continue;
        const obj = fn.namedChildren[0];
        if (!obj || obj.text === "Workflow" || obj.text === "z") continue;

        const args = call.descendantsOfType("arguments")[0];
        const firstArg = args?.namedChildren[0];
        if (!firstArg) continue;

        ctxRunCalls.push({
          executableIdentifier: firstArg.text,
          lineNumber: call.startPosition.row + 1,
          node: call,
        });
      }

      if (ctxRunCalls.length > 0) {
        const strings = root.descendantsOfType("string");
        let workflowName = "partial";
        for (const s of strings) {
          const prev = s.parent?.namedChildren[0];
          if (prev?.text === "name") {
            workflowName = s.text.replace(/^['"]|['"]$/g, "");
            break;
          }
        }

        const nodes: DAGNode[] = [{ id: "input", label: "Input", type: "input" }];
        const edges: DAGEdge[] = [];
        let prevId = "input";

        for (let i = 0; i < ctxRunCalls.length; i++) {
          const call = ctxRunCalls[i];
          const importInfo = imports.get(call.executableIdentifier);
          const nodeId = `step-${i}`;
          nodes.push({
            id: nodeId,
            label: humanize(call.executableIdentifier),
            type: importInfo ? inferType(importInfo.source) : "node",
            executableName: call.executableIdentifier,
            importPath: importInfo?.source,
            lineNumber: call.lineNumber,
          });
          edges.push({ id: `${prevId}->${nodeId}`, source: prevId, target: nodeId });
          prevId = nodeId;
        }

        nodes.push({ id: "output", label: "Output", type: "output" });
        edges.push({ id: `${prevId}->output`, source: prevId, target: "output" });

        dags.push({ workflowName, version: 1, filePath, nodes, edges });
      }
    }

    return dags;
  }

  for (const createCall of workflowCalls) {
    const workflowName = extractWorkflowName(createCall) ?? "unknown";
    const version = extractWorkflowVersion(createCall);

    // Extract schema fields for richer input/output nodes
    const inputSchemaVar = getSchemaVarName(createCall, "inputSchema");
    const outputSchemaVar = getSchemaVarName(createCall, "outputSchema");
    const inputFields = inputSchemaVar ? extractSchemaFields(root, inputSchemaVar) : [];
    const outputFields = outputSchemaVar ? extractSchemaFields(root, outputSchemaVar) : [];

    const runMethod = findRunMethod(createCall);
    if (!runMethod) {
      dags.push({
        workflowName,
        version,
        filePath,
        nodes: [
          { id: "input", label: "Input", type: "input", fields: inputFields.length > 0 ? inputFields : undefined },
          { id: "output", label: "Output", type: "output", fields: outputFields.length > 0 ? outputFields : undefined },
        ],
        edges: [{ id: "input->output", source: "input", target: "output" }],
      });
      continue;
    }

    const ctxName = getContextParamName(runMethod);
    const runBody = runMethod.descendantsOfType("statement_block")[0];
    if (!runBody) continue;

    const ctxRunCalls = extractCtxRunCalls(runBody, ctxName);

    const nodes: DAGNode[] = [];
    const edges: DAGEdge[] = [];
    let condCounter = 0;
    const loopGroupMap = new Map<SyntaxNode, { label: string; stepIds: string[] }>();

    nodes.push({ id: "input", label: "Input", type: "input", fields: inputFields.length > 0 ? inputFields : undefined });

    let prevNodeIds: string[] = ["input"];
    let prevLine = 0;

    for (let i = 0; i < ctxRunCalls.length; i++) {
      const call = ctxRunCalls[i];
      const importInfo = imports.get(call.executableIdentifier);
      const execType = importInfo ? inferType(importInfo.source) : "node";

      const nodeId = `step-${i}`;
      const ifContext = getEnclosingIfCondition(call.node, runBody);

      // Track loop group membership
      const enclosingLoop = findEnclosingLoop(call.node, runBody);
      if (enclosingLoop) {
        if (!loopGroupMap.has(enclosingLoop)) {
          loopGroupMap.set(enclosingLoop, {
            label: extractLoopLabel(enclosingLoop),
            stepIds: [],
          });
        }
        loopGroupMap.get(enclosingLoop)!.stepIds.push(nodeId);
      }

      const guards = findGuardClausesBetween(runBody, prevLine, call.lineNumber);
      for (const guard of guards) {
        const condId = `condition-${condCounter++}`;
        nodes.push({
          id: condId,
          label: guard.condition,
          type: "condition",
          lineNumber: guard.lineNumber,
        });

        for (const prev of prevNodeIds) {
          edges.push({ id: `${prev}->${condId}`, source: prev, target: condId });
        }

        edges.push({ id: `${condId}->output-guard`, source: condId, target: "output", label: "yes" });

        prevNodeIds = [condId];
      }

      if (ifContext) {
        const condId = `condition-${condCounter++}`;
        const conditionExists = nodes.some(
          (n) => n.type === "condition" && n.label === ifContext.condition,
        );

        if (!conditionExists) {
          nodes.push({
            id: condId,
            label: ifContext.condition,
            type: "condition",
            lineNumber: call.lineNumber,
          });

          for (const prev of prevNodeIds) {
            edges.push({ id: `${prev}->${condId}`, source: prev, target: condId });
          }
          prevNodeIds = [condId];
        }

        nodes.push({
          id: nodeId,
          label: humanize(call.executableIdentifier),
          type: execType,
          executableName: call.executableIdentifier,
          importPath: importInfo?.source,
          lineNumber: call.lineNumber,
        });

        const sourceCondId = nodes.find(
          (n) => n.type === "condition" && n.label === ifContext.condition,
        )?.id ?? condId;

        edges.push({
          id: `${sourceCondId}->${nodeId}`,
          source: sourceCondId,
          target: nodeId,
          label: ifContext.isElseBranch ? "else" : "then",
        });

        if (isFollowedByReturn(call.node, runBody)) {
          edges.push({ id: `${nodeId}->output`, source: nodeId, target: "output" });
        } else {
          prevNodeIds = [...prevNodeIds.filter((p) => p !== sourceCondId), nodeId];
        }
      } else {
        nodes.push({
          id: nodeId,
          label: humanize(call.executableIdentifier),
          type: execType,
          executableName: call.executableIdentifier,
          importPath: importInfo?.source,
          lineNumber: call.lineNumber,
        });

        for (const prev of prevNodeIds) {
          edges.push({ id: `${prev}->${nodeId}`, source: prev, target: nodeId });
        }

        prevNodeIds = [nodeId];
      }

      prevLine = call.lineNumber;
    }

    const lastLine = ctxRunCalls.length > 0 ? ctxRunCalls[ctxRunCalls.length - 1].lineNumber : 0;
    const trailingGuards = findGuardClausesBetween(runBody, lastLine, 999999);
    for (const guard of trailingGuards) {
      const condId = `condition-${condCounter++}`;
      nodes.push({
        id: condId,
        label: guard.condition,
        type: "condition",
        lineNumber: guard.lineNumber,
      });
      for (const prev of prevNodeIds) {
        edges.push({ id: `${prev}->${condId}`, source: prev, target: condId });
      }
      edges.push({ id: `${condId}->output-guard`, source: condId, target: "output", label: "yes" });
      prevNodeIds = [condId];
    }

    nodes.push({ id: "output", label: "Output", type: "output", fields: outputFields.length > 0 ? outputFields : undefined });

    for (const prev of prevNodeIds) {
      const alreadyConnected = edges.some(
        (e) => e.source === prev && e.target === "output",
      );
      if (!alreadyConnected) {
        edges.push({ id: `${prev}->output`, source: prev, target: "output" });
      }
    }

    // Build loop groups array
    const loopGroups: LoopGroup[] = [];
    let loopCounter = 0;
    for (const [, group] of loopGroupMap) {
      loopGroups.push({
        id: `loop-${loopCounter++}`,
        label: group.label,
        nodeIds: group.stepIds,
      });
    }

    dags.push({
      workflowName,
      version,
      filePath,
      nodes,
      edges,
      loopGroups: loopGroups.length > 0 ? loopGroups : undefined,
    });
  }

  return dags;
}
