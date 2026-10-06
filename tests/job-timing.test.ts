import { describe, expect, it } from "vitest";
import { durationEstimate, timingSnapshot } from "../src/worker/timing";

describe("worker job wall clock", () => {
  it("uses a bounded median estimate", () => {
    expect(durationEstimate([30000, 50000, 70000])).toBe(50000);
    expect(durationEstimate([])).toBe(300000);
  });

  it("reports ETA and overdue state from the durable deadline", () => {
    const started = "2026-10-06T12:00:00.000Z";
    const deadline = "2026-10-06T12:05:00.000Z";
    const snapshot = timingSnapshot({
      state: "running",
      created_at: started,
      updated_at: started,
      started_at: started,
      heartbeat_at: started,
      finished_at: null,
      deadline_at: deadline,
      estimated_duration_ms: 300000,
      attempt: 1,
    }, new Date("2026-10-06T12:03:00.000Z"));

    expect(snapshot.elapsedMs).toBe(180000);
    expect(snapshot.remainingMs).toBe(120000);
    expect(snapshot.etaAt).toBe(deadline);
    expect(snapshot.overdue).toBe(false);
  });

  it("marks a running job overdue without pretending it is finished", () => {
    const snapshot = timingSnapshot({
      state: "running",
      created_at: "2026-10-06T12:00:00.000Z",
      updated_at: "2026-10-06T12:00:00.000Z",
      started_at: "2026-10-06T12:00:00.000Z",
      heartbeat_at: "2026-10-06T12:00:00.000Z",
      finished_at: null,
      deadline_at: "2026-10-06T12:05:00.000Z",
      estimated_duration_ms: 300000,
      attempt: 1,
    }, new Date("2026-10-06T12:06:00.000Z"));

    expect(snapshot.overdue).toBe(true);
    expect(snapshot.remainingMs).toBe(0);
  });
});
