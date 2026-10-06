import { z } from "zod";

/**
 * Bounded research acquisition envelope.
 *
 * Chanfana owns delivery, leasing, deadlines and retry semantics.
 * Mirror owns the actual scientific research instrument.
 * Automate owns interpretation/certification.
 *
 * Keeping this envelope separate from the implementation-worker packet prevents
 * research jobs from being accidentally routed through the code-writing worker.
 */

export const ResearchProvider = z.enum([
  "crossref",
  "openalex",
  "arxiv",
  "github",
  "huggingface",
]);

export const ResearchJobEnvelope = z.object({
  schema_version: z.literal("mirror.research_job.v1"),
  request_id: z.string().min(8).max(128),
  execution_kind: z.literal("external_research"),
  target: z.object({
    mirror_endpoint: z.string().url(),
  }),
  query: z.string().min(1).max(500),
  providers: z.array(ResearchProvider).min(1).max(5),
  limits: z.object({
    max_results_per_provider: z.number().int().min(1).max(10),
    deadline_ms: z.number().int().min(1_000).max(900_000),
    max_response_bytes: z.number().int().min(1_024).max(1_500_000),
  }),
  provenance: z.object({
    capability_id: z.string().min(1).max(128),
    experiment_id: z.string().min(1).max(128).nullable(),
    correlation_id: z.string().min(1).max(128),
  }),
});

export type ResearchJobEnvelopeType = z.infer<typeof ResearchJobEnvelope>;

export function validateResearchJobEnvelope(input: unknown): ResearchJobEnvelopeType {
  const parsed = ResearchJobEnvelope.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid mirror research job envelope: " + parsed.error.message);
  }
  return parsed.data;
}
