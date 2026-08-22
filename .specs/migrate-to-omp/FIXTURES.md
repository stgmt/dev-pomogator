# Fixtures

## OMP migration fixture contract

| Fixture | Location | Lifecycle | Ground truth |
|---|---|---|---|
| Disposable OMP project | temporary directory outside repository worktree | per scenario | Contains project-scope .omp plugin state only. |
| Isolated spec root | temporary .specs/migrate-test-* fixture | per scenario | Contains migration fixture plus unrelated sentinel spec checked before and after rollback. |
| Root marketplace catalog | copied root catalog | per feature | Resolves dev-pomogator source ./ from marketplace root. |
| Runtime capture | OMP image/test output | per image build | Captures version, digest and plugin command surface. |
| MCP transcript | JSON-RPC capture | per W0/W1 run | Shows read success and invalid mutation refusal without write. |

## Fixture safety

- No fixture may reset repository .specs or use user OMP state.
- Cleanup removes only the recorded temporary fixture, project-scope state and disposable container.
- Rollback compares sentinel bytes before and after a forced failure.

## Provenance

External OMP output is captured from the real runtime used by the test. Hand-authored output cannot prove installation, loading, MCP discovery or hook execution.
