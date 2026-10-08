# Automate System Memory

## Purpose

Chanfana provides the durable memory layer for the three-repository system. It preserves bounded operational experience so Automate and Mirror can resume work, diagnose recurring failures, and improve future strategy selection after an execution ends.

Memory is not scientific authority.

## What is remembered

The learning-artifact store can persist versioned, hashed records such as:

- learning experiences;
- lessons;
- research proposals and results;
- evolution proposals and plans;
- repair outcomes;
- bounded evidence or workflow observations.

Each stored artifact carries its type, authority marker, source repository, source revision when available, correlation ID, content hash, and timestamps.

## How memory is used

```
work / experiment / repair
        ↓
bounded result
        ↓
learning artifact
        ↓
Chanfana durable storage
        ↓
future Automate / Mirror cycle
```

The memory layer should help answer:

- what was attempted?
- on which revision?
- what happened?
- what failed and why?
- what repair worked?
- what remains unresolved?
- which strategies repeatedly succeed or fail?

Memory must preserve provenance and uncertainty instead of flattening everything into "success."

## Authority boundary

Chanfana stores and serves memory. It does not decide that a remembered lesson is true, and it does not certify scientific capabilities.

Automate remains responsible for canonical mathematical semantics, capability ordering, acceptance, promotion, and certification.

Mirror uses memory to guide research, implementation, diagnosis, repair, and discovery.

## Persistence rule

A memory record should be immutable in meaning and attributable in origin. New evidence or correction should create a new versioned experience/lesson rather than silently rewriting historical evidence.

The durable store therefore functions as system memory, not a hidden second source of truth.

## Operational target

The long-running loop is:

Automate selects work → Chanfana persists the job → Mirror/worker executes → results are verified → outcome is recorded in memory → Automate recomputes the frontier → next task.

That loop should survive worker failure, request interruption, stale execution leases, and ordinary repository turnover.
