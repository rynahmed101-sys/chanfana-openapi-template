import type { WorkerJobMessage } from "./queue";

declare global {
  interface Env {
    AUTOMATE_JOB_QUEUE: Queue<WorkerJobMessage>;
    MIRROR_RESEARCH_JOB_TOKEN?: string;
    MIRROR_RESEARCH_ENDPOINT?: string;
    VERIFICATION_ENGINE_JOB_TOKEN?: string;
    VERIFICATION_ENGINE_ENDPOINT?: string;
  }
}

export {};
