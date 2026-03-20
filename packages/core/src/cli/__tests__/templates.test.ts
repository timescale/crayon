import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeAppTemplates } from "../mcp/lib/templates.js";

describe("writeAppTemplates", () => {
  let destDir: string;

  afterEach(async () => {
    if (destDir) {
      await rm(destDir, { recursive: true, force: true });
    }
  });

  it("creates .gitignore from gitignore template", async () => {
    destDir = await mkdtemp(join(tmpdir(), "crayon-test-"));
    await writeAppTemplates(destDir, {
      app_name: "test-app",
      crayon_version: "dev",
    });

    expect(existsSync(join(destDir, ".gitignore"))).toBe(true);
    // The dotless source file should NOT exist in the output
    expect(existsSync(join(destDir, "gitignore"))).toBe(false);
  });

  it("creates CLAUDE.md with app name", async () => {
    destDir = await mkdtemp(join(tmpdir(), "crayon-test-"));
    await writeAppTemplates(destDir, {
      app_name: "my-app",
      crayon_version: "dev",
    });

    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(destDir, "CLAUDE.md"), "utf-8"),
    );
    expect(content).toContain("# my-app");
    expect(content).toContain("create_version");
  });

  it("includes cloud section in CLAUDE.md when fly_app_name is set", async () => {
    destDir = await mkdtemp(join(tmpdir(), "crayon-test-"));
    await writeAppTemplates(destDir, {
      app_name: "my-app",
      crayon_version: "dev",
      fly_app_name: "crayon-dev-abc123",
    });

    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(destDir, "CLAUDE.md"), "utf-8"),
    );
    expect(content).toContain("https://crayon-dev-abc123.fly.dev/");
    expect(content).toContain("Cloud Dev Environment");
  });

  it("omits cloud section in CLAUDE.md when fly_app_name is not set", async () => {
    destDir = await mkdtemp(join(tmpdir(), "crayon-test-"));
    await writeAppTemplates(destDir, {
      app_name: "my-app",
      crayon_version: "dev",
    });

    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(destDir, "CLAUDE.md"), "utf-8"),
    );
    expect(content).not.toContain("Cloud Dev Environment");
    expect(content).not.toContain("fly.dev");
  });
});
