# Second incident provenance boundary

Status: `REPLAY_UNAVAILABLE`.

The user-supplied postmortem is a regression-requirements source only. It is not a local producer artifact and contains no authoritative dev-pomogator implementation evidence.

Authoritative replay requires all of the following original inputs, reconciled by run/worktree/owner identity:

- run-state and terminal state;
- per-run journal and monotonic sequence;
- process-group and writer scans;
- terminal stdout/stderr/native exit diagnostics;
- checkout-writer and shared-runtime lease evidence;
- resource labels and actual mount/source evidence;
- baseline SHA and dirty-path evidence;
- independent producer readback.

Adjacent-project commits, tests, models, container names, and reported metrics remain context only. Do not create a positive synthetic journal from the prose.
