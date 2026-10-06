import type { WorkerJobMessage } from "./queue";

declare global {
  interface Env {
    AUTOMATE_JOB_QUEUE: Queue<WorkerJobMessage>;
    MIRROR_RESEARCH_JOB_TOKEN?: string;
  }
}

export {};
