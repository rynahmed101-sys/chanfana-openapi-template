# Engine role

This repository is the execution substrate for the autonomous scientific engine.

It does not own mathematical truth, the Automate phase ledger, certification, or repository authority.

Its job is to accept bounded worker packets, persist jobs durably, execute within explicit resource/time limits, retain leases and heartbeats, recover stale work, and return structured results plus provenance.

A worker result is always untrusted evidence. It must pass Automate-side validation before it can influence a capability branch.

The worker can advance independently on the `engine` branch. The certified `main` branch is a release surface, not a development stop signal.

Cross-repository identifiers should preserve `action_cycle_id`, `capability_id`, `packet_id`, `job_id`, and `result_id` whenever present.
