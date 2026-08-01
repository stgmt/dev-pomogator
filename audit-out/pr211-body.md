## Summary
- remove the cross-project product/€200 policy from the technical research skill and its spec/test wiring
- add a dependency-free shipped skill-health checker for source CI, release, and installed plugin layouts
- repair confirmed malformed or missing skill metadata and document the CARL root-cause analysis

## Verification
- Docker BDD: SRO018–SRO026 — 9 scenarios, 62 steps passed
- Docker BDD: CMEM001_28–CMEM001_33 — 6 scenarios, 27 steps passed
- `npm run check:skill-health` — 54 skills, 0 blocking findings
- checker self-test — 4 passed
- changed-file ESLint — passed
- `specs-management-as-skill` and `skills-rules-optimizer` structural validation — passed
- clean replay branch contains exactly the two owned patches on `origin/main`

## Notes
The earlier branch `feat/skill-health-hardening` is quarantined because it accidentally inherited unrelated context-mode commits. This PR uses only `feat/skill-health-hardening-clean`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
