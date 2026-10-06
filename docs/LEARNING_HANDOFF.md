# Learning Handoff

Chanfana treats learning artifacts as durable transport payloads, not scientific truth.

The `automate.learning_handoff.v1` envelope can carry:

- Automate learning experiences and lessons;
- Mirror research proposals and research results;
- Automate system-evolution proposals and plans.

Chanfana validates the transport envelope, persists the payload in its normal durable job result store, and returns it through the existing job-read path. It must not interpret the scientific meaning, promote lessons, certify capabilities, or mutate Automate authority.

The intended path is:

```
Mirror / worker
      ↓
learning handoff envelope
      ↓
Chanfana durable job
      ↓
persisted result
      ↓
Verification / Automate
```

The envelope is explicitly untrusted. Durable persistence is not verification.
