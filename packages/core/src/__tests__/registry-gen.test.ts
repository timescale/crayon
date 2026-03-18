import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateRegistry } from "../registry-gen.js";

describe("generateRegistry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-registry-test-"));
    // Create directory structure
    fs.mkdirSync(path.join(tmpDir, "src", "crayon", "workflows"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src", "crayon", "agents"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src", "crayon", "nodes"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates correct imports when one export name is a prefix of another", () => {
    // Write two workflow files where one name is a prefix of the other
    fs.writeFileSync(
      path.join(tmpDir, "src", "crayon", "workflows", "classify-icp.ts"),
      `import { Workflow } from "runcrayon";
export const classifyIcp = Workflow.create({
  name: "classify-icp",
  version: 1,
  description: "Classifies ICP",
  inputSchema: z.object({}),
  async run() { return {}; },
});
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "src", "crayon", "workflows", "classify-icp-poll.ts"),
      `import { Workflow } from "runcrayon";
export const classifyIcpPoll = Workflow.create({
  name: "classify-icp-poll",
  version: 1,
  description: "Polls and classifies ICP",
  inputSchema: z.object({}),
  async run() { return {}; },
});
`,
    );

    const outPath = generateRegistry(tmpDir);
    const content = fs.readFileSync(outPath, "utf-8");

    // classifyIcp must import from classify-icp, NOT classify-icp-poll
    expect(content).toContain('import { classifyIcp } from "../workflows/classify-icp"');
    expect(content).toContain('import { classifyIcpPoll } from "../workflows/classify-icp-poll"');

    // Must NOT have classifyIcp imported from the poll file
    expect(content).not.toContain('import { classifyIcp } from "../workflows/classify-icp-poll"');
  });

  it("generates correct registry for a simple project", () => {
    fs.writeFileSync(
      path.join(tmpDir, "src", "crayon", "workflows", "my-workflow.ts"),
      `export const myWorkflow = Workflow.create({
  name: "my-workflow",
  version: 1,
  description: "test",
  inputSchema: z.object({}),
  async run() {},
});
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "src", "crayon", "nodes", "my-node.ts"),
      `export const myNode = Node.create({
  name: "my-node",
  description: "test",
  inputSchema: z.object({}),
  async execute() {},
});
`,
    );

    const outPath = generateRegistry(tmpDir);
    const content = fs.readFileSync(outPath, "utf-8");

    expect(content).toContain('"my-workflow": myWorkflow');
    expect(content).toContain('"my-node": myNode');
  });
});
