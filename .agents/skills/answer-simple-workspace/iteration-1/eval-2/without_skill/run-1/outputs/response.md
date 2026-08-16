I can help with this migration task, but I need to clarify a few things before proceeding because the request references several artifacts I don't have direct context on.

## What I understand

You want to:
1. Migrate Adapter X to the new FR-8 semantics
2. This should happen after v0.2.5 is deployed (which contains Wave 14 of the foo-bar spec)
3. There's a dependency on FR-3 from the baz-quux spec

## What I need to clarify

Before I can plan or execute this, I need to look at the relevant specs:

1. **`foo-bar` spec, Wave 14** — what does v0.2.5 actually deliver? I'd want to read `.specs/foo-bar/` (likely `TASKS.md` or `IMPLEMENTATION.md`) to understand what landed.
2. **FR-8 semantics** — which spec does FR-8 belong to? If it's in `foo-bar/FR.md`, I'd read that section. If it's elsewhere, please point me to it.
3. **Adapter X** — what's the actual name of the adapter and where does it live in the codebase? "Adapter X" sounds like a placeholder.
4. **FR-3 from baz-quux** — I'd read `.specs/baz-quux/FR.md` to understand the dependency, and check whether it's already implemented.

## Proposed next steps

If you confirm, I'll:

1. Read the three spec files (`foo-bar`, `baz-quux`, and wherever FR-8 lives)
2. Locate Adapter X in the codebase
3. Verify v0.2.5 / Wave 14 is actually deployed
4. Verify FR-3 from baz-quux is done
5. Come back with a concrete migration plan before touching any code

Could you:
- Confirm the real name of "Adapter X"
- Confirm which spec contains FR-8
- Confirm whether v0.2.5 is already deployed or whether the deployment is part of this task

Once I have those, I can move forward.
