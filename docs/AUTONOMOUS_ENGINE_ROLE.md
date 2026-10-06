> **System authority:** The complete cross-repository architecture is maintained in Automate at `docs/AUTONOMOUS_SYSTEM_MASTER_PLAN.md`. This document defines Chanfana's implementation role.

# Chanfana role: execution substrate and verifier control plane

Chanfana is the **durable execution nervous system** of the autonomous scientific ecosystem and an internal substrate of the Verification & Reconciliation Engine.

It is not a separate scientific authority and it is not the whole verifier.

## What Chanfana owns

Chanfana owns the mechanics that make autonomous work durable, bounded, authenticated, recoverable, and traceable:

- job persistence;
- queue dispatch;
- execution leases;
- heartbeats;
- stale-job recovery;
- retry/requeue and dead-letter handling;
- worker authentication;
- resource/time guards;
- structured job/result transport;
- execution timing;
- provenance/evidence persistence;
- provider-neutral research envelopes.

The existing `src/worker/` machinery already reflects this direction through contracts, auth, guards, job running, queueing, recovery, timing, model-provider boundaries, and research envelopes.

## Chanfana's place inside the Verification Engine

The Verification Engine is a logical subsystem assembled across repositories.

```
Verifier reasoning
      ↓
Chanfana job
      ↓
lease / execute / heartbeat
      ↓
recover / persist / return evidence
```

The verifier may schedule reconciliation, verification, repair, CI-wait, evidence-assembly, or Mirror-request jobs through Chanfana.

Chanfana must not decide whether the result is scientifically correct, whether a capability is authoritative, or whether a PR may be certified.

## Shared compartments

Chanfana may share implementation responsibility for:

- packet/job schemas;
- correlation IDs;
- provenance and evidence receipts;
- repair job envelopes;
- experiment request/result transport;
- CI/security receipt transport.

The rule is one contract, explicit ownership, no competing copies.

## Relationship with Mirror

Mirror is the scientific laboratory. When a verification task needs simulation, perturbation, numerical stability analysis, or counterexample search, the verifier can submit a bounded Mirror job through Chanfana.

```
Verification Engine
      ↓
Chanfana durable job
      ↓
Mirror laboratory
      ↓
raw observation + provenance
      ↓
Chanfana transport/persistence
      ↓
Verification Engine
```

Chanfana transports and bounds the work. Mirror performs the science experiment. Neither one certifies Automate.

## Relationship with Automate

Automate owns canonical mathematical/physical semantics, capability ordering, inventory, acceptance policy, Git promotion, and certification.

Chanfana can carry Automate packets and evidence but cannot alter the authoritative state.

## Development rule

The `engine` branch is the active development trunk. `main` is the release surface.

Do not build a second verification platform beside Chanfana. Extend the existing durable machinery where the verifier needs it, while keeping scientific reasoning and laboratory algorithms in their proper compartments.
