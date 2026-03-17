import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Tracks queries on the pool (used for error cron_runs inserts + poll queries)
const mockPoolQuery = vi.hoisted(() => vi.fn());
// Tracks queries on the transactional client
const mockClientQuery = vi.hoisted(() => vi.fn());
const mockClientRelease = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  getPool: vi.fn().mockResolvedValue({
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: () => mockConnect(),
  }),
}));

vi.mock("../executor", () => ({
  triggerWorkflow: vi.fn(),
  pollRunStatus: vi.fn(),
}));

vi.mock("../next-run", () => ({
  computeNextRun: vi.fn().mockReturnValue(new Date("2026-03-18T00:00:00Z")),
}));

import { startScheduler, stopScheduler, _tick } from "../scheduler";
import { triggerWorkflow, pollRunStatus } from "../executor";

function newMockClient() {
  const q = vi.fn().mockResolvedValue({ rows: [] });
  const r = vi.fn();
  mockConnect.mockResolvedValueOnce({ query: q, release: r });
  return { query: q, release: r };
}

describe("scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockConnect.mockReset();
    vi.mocked(triggerWorkflow).mockReset();
    vi.mocked(pollRunStatus).mockReset();
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  describe("startScheduler / stopScheduler", () => {
    it("starts and stops without error", () => {
      const c = newMockClient();
      c.query.mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (empty)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      mockPoolQuery.mockResolvedValue({ rows: [] });

      startScheduler();
      stopScheduler();
    });

    it("is idempotent", () => {
      const c = newMockClient();
      c.query.mockResolvedValue({ rows: [] });
      mockPoolQuery.mockResolvedValue({ rows: [] });
      startScheduler();
      startScheduler(); // second call is no-op
      stopScheduler();
    });
  });

  describe("tick - trigger phase", () => {
    it("claims a job, triggers workflow, and commits", async () => {
      const c = newMockClient();
      c.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ // SELECT FOR UPDATE — 1 job
          rows: [{
            id: 1, machine_id: 10, workflow_name: "daily-sync",
            cron_expression: "0 0 * * *", timezone: "UTC",
            input: { key: "value" }, created_by: "user-1",
            fly_app_name: "my-app",
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // INSERT cron_runs
        .mockResolvedValueOnce({ rows: [] }) // UPDATE next_run_at
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Second iteration: no more jobs
      const c2 = newMockClient();
      c2.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (empty)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // poll: no pending
        .mockResolvedValueOnce({ rows: [] }); // poll: timeout

      vi.mocked(triggerWorkflow).mockResolvedValue({
        httpStatus: 202, runId: "run-123", error: null,
      });

      await _tick();

      expect(triggerWorkflow).toHaveBeenCalledWith(
        "my-app", "daily-sync", { key: "value" }, "user-1",
      );

      // cron_runs insert happened on the client (inside transaction)
      expect(c.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO cron_runs"),
        [1, "triggered", "run-123", 202],
      );

      expect(c.release).toHaveBeenCalled();
    });

    it("rolls back and records error when trigger fails", async () => {
      const c = newMockClient();
      c.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 2, machine_id: 10, workflow_name: "broken",
            cron_expression: "0 0 * * *", timezone: "UTC",
            input: {}, created_by: "user-1", fly_app_name: "my-app",
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      // Second iteration: no more jobs
      const c2 = newMockClient();
      c2.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      // Error insert (outside txn) + poll queries
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // INSERT cron_runs error
        .mockResolvedValueOnce({ rows: [] }) // poll: no pending
        .mockResolvedValueOnce({ rows: [] }); // poll: timeout

      vi.mocked(triggerWorkflow).mockRejectedValue(
        new Error("Connection refused"),
      );

      await _tick();

      // Error recorded outside the transaction via pool
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO cron_runs"),
        [2, "Connection refused"],
      );
    });

    it("skips when no due jobs", async () => {
      const c = newMockClient();
      c.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (empty)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // poll: no pending
        .mockResolvedValueOnce({ rows: [] }); // poll: timeout

      await _tick();

      expect(triggerWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("tick - poll phase", () => {
    it("updates status when workflow completes", async () => {
      // Phase 1: no due jobs
      const c = newMockClient();
      c.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPoolQuery
        .mockResolvedValueOnce({ // poll: one pending run
          rows: [{
            id: 5, run_id: "run-abc",
            started_at: new Date("2026-03-17T10:00:00Z"),
            created_by: "user-1", fly_app_name: "my-app",
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE cron_runs
        .mockResolvedValueOnce({ rows: [] }); // timeout

      vi.mocked(pollRunStatus).mockResolvedValue({
        status: "SUCCESS", error: null,
      });

      await _tick();

      expect(pollRunStatus).toHaveBeenCalledWith("my-app", "run-abc", "user-1");
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'success'"),
        expect.arrayContaining([5]),
      );
    });

    it("leaves triggered runs alone when still pending", async () => {
      const c = newMockClient();
      c.query.mockResolvedValue({ rows: [] });

      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 6, run_id: "run-pending", started_at: new Date(),
            created_by: "user-1", fly_app_name: "my-app",
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // timeout

      vi.mocked(pollRunStatus).mockResolvedValue({
        status: "PENDING", error: null,
      });

      await _tick();

      const updateCalls = mockPoolQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("UPDATE cron_runs SET status"),
      );
      expect(updateCalls).toHaveLength(0);
    });
  });
});
