import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSignDevUIToken = vi.fn().mockResolvedValue("mock-jwt-token");
const mockQuery = vi.fn().mockResolvedValue({
  rows: [{ github_login: "testuser" }],
});

vi.mock("@/lib/jwt", () => ({
  signDevUIToken: (...args: unknown[]) => mockSignDevUIToken(...args),
}));

vi.mock("@/lib/db", () => ({
  getPool: vi.fn().mockResolvedValue({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

import { triggerWorkflow, pollRunStatus } from "../executor";

describe("triggerWorkflow", () => {
  beforeEach(() => {
    mockSignDevUIToken.mockResolvedValue("mock-jwt-token");
    mockQuery.mockResolvedValue({
      rows: [{ github_login: "testuser" }],
    });
  });

  it("calls the correct URL with JWT auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          status: "accepted",
          runId: "test-run-id",
          workflow: "my-workflow",
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await triggerWorkflow(
      "my-fly-app",
      "my-workflow",
      { key: "value" },
      "user-123",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://my-fly-app.fly.dev/dev/api/workflows/my-workflow/start",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ input: { key: "value" } }),
      }),
    );

    expect(result.httpStatus).toBe(202);
    expect(result.runId).toBe("test-run-id");
    expect(result.error).toBeNull();
  });

  it("returns error for non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      }),
    );

    const result = await triggerWorkflow(
      "my-fly-app",
      "my-workflow",
      {},
      "user-123",
    );

    expect(result.httpStatus).toBe(500);
    expect(result.error).toBe("HTTP 500");
  });

  it("encodes workflow names with special characters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ status: "accepted", runId: "id" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await triggerWorkflow("app", "my workflow", {}, "user-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.fly.dev/dev/api/workflows/my%20workflow/start",
      expect.anything(),
    );
  });
});

describe("pollRunStatus", () => {
  beforeEach(() => {
    mockSignDevUIToken.mockResolvedValue("mock-jwt-token");
    mockQuery.mockResolvedValue({
      rows: [{ github_login: "testuser" }],
    });
  });

  it("returns workflow status on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ status: "SUCCESS", error: null }),
      }),
    );

    const result = await pollRunStatus("app", "run-id", "user-123");
    expect(result).toEqual({ status: "SUCCESS", error: null });
  });

  it("returns null when machine is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await pollRunStatus("app", "run-id", "user-123");
    expect(result).toBeNull();
  });

  it("returns null for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    const result = await pollRunStatus("app", "run-id", "user-123");
    expect(result).toBeNull();
  });
});
