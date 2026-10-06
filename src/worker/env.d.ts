import type { WorkerJobMessage } from "./queue";

declare global {
  interface Env {
    AUTOMATE_JOB_QUEUE: Queue<WorkerJobMessage>;
  }
}

export {};
