import { Hono } from "hono";
import { fromHono } from "chanfana";
import { WorkerHealth } from "./health";
import { WorkerJobClaim } from "./jobClaim";
import { WorkerJobCreate } from "./jobCreate";
import { WorkerJobRead } from "./jobRead";
import { WorkerJobResult } from "./jobResult";
import { requireWorkerAuth } from "../../worker/auth";
import { LearningCreate } from "./learningCreate";
import { LearningRead } from "./learningRead";
import { WorkerJobExecute } from "./jobExecute";

export const workerRouter = fromHono(new Hono<{ Bindings: Env }>());

workerRouter.get("/health", WorkerHealth);
workerRouter.use("/jobs/*", requireWorkerAuth);
workerRouter.post("/jobs", WorkerJobCreate);
workerRouter.get("/jobs/:id", WorkerJobRead);
workerRouter.post("/jobs/:id/claim", WorkerJobClaim);
workerRouter.post("/jobs/:id/execute", WorkerJobExecute);
workerRouter.post("/jobs/:id/result", WorkerJobResult);

workerRouter.use("/learning", requireWorkerAuth);
workerRouter.post("/learning", LearningCreate);
workerRouter.get("/learning", LearningRead);
