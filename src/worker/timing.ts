const DEFAULT_ESTIMATE_MS = 5 * 60 * 1000;
const MIN_ESTIMATE_MS = 15 * 1000;
const MAX_ESTIMATE_MS = 30 * 60 * 1000;

export type JobTimingRow = {
  state: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  heartbeat_at: string | null;
  finished_at: string | null;
  deadline_at: string | null;
  estimated_duration_ms: number | null;
  attempt: number;
};

export function durationEstimate(samples: number[]): number {
  if (!samples.length) return DEFAULT_ESTIMATE_MS;
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return DEFAULT_ESTIMATE_MS;
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.min(MAX_ESTIMATE_MS, Math.max(MIN_ESTIMATE_MS, Math.round(median)));
}

export function timingSnapshot(row: JobTimingRow, now = new Date()): {
  startedAt: string | null;
  heartbeatAt: string | null;
  finishedAt: string | null;
  deadlineAt: string | null;
  estimatedDurationMs: number | null;
  elapsedMs: number;
  remainingMs: number | null;
  etaAt: string | null;
  overdue: boolean;
  attempt: number;
} {
  const started = row.started_at ? Date.parse(row.started_at) : NaN;
  const nowMs = now.getTime();
  const elapsedMs = Number.isFinite(started) ? Math.max(0, nowMs - started) : 0;
  const deadline = row.deadline_at ? Date.parse(row.deadline_at) : NaN;
  const remainingMs = Number.isFinite(deadline) && row.state === "running"
    ? Math.max(0, deadline - nowMs)
    : row.state === "running" && row.estimated_duration_ms != null
      ? Math.max(0, row.estimated_duration_ms - elapsedMs)
      : null;
  const etaMs = Number.isFinite(deadline)
    ? deadline
    : row.state === "running" && row.estimated_duration_ms != null && Number.isFinite(started)
      ? started + row.estimated_duration_ms
      : NaN;
  return {
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    finishedAt: row.finished_at,
    deadlineAt: row.deadline_at,
    estimatedDurationMs: row.estimated_duration_ms,
    elapsedMs,
    remainingMs,
    etaAt: Number.isFinite(etaMs) ? new Date(etaMs).toISOString() : null,
    overdue: Number.isFinite(deadline) && nowMs > deadline && row.state === "running",
    attempt: row.attempt,
  };
}
