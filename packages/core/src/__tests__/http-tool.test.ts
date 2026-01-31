// packages/core/src/__tests__/http-tool.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpGet } from "../nodes/builtin/http.js";
import { createWorkflowContext } from "../context.js";

describe("httpGet tool", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("has correct properties", () => {
    expect(httpGet.name).toBe("http_get");
    expect(httpGet.type).toBe("node");
    expect(httpGet.description).toContain("HTTP GET");
  });

  it("executes fetch with correct parameters", async () => {
    const mockHeaders = new Headers();
    mockHeaders.set("content-type", "text/html");

    const mockResponse = {
      status: 200,
      text: vi.fn().mockResolvedValue("<html>Test</html>"),
      headers: mockHeaders,
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const ctx = createWorkflowContext();
    const result = await httpGet.execute(ctx, {
      url: "https://example.com",
      headers: { Authorization: "Bearer token" },
    });

    expect(global.fetch).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe("<html>Test</html>");
    expect(result.headers["content-type"]).toBe("text/html");
  });

  it("works without custom headers", async () => {
    const mockResponse = {
      status: 404,
      text: vi.fn().mockResolvedValue("Not Found"),
      headers: new Headers(),
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const ctx = createWorkflowContext();
    const result = await httpGet.execute(ctx, {
      url: "https://example.com/missing",
    });

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/missing", {
      method: "GET",
      headers: undefined,
    });
    expect(result.status).toBe(404);
  });
});
