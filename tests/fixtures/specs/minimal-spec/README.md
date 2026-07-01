# minimal-spec — empty edges shape (F-21)

Smallest possible spec shape — single FR, zero ACs, zero scenarios, zero tasks,
and a `FILE_CHANGES.md` that contains only the header row (no data rows).

Used by `tests/e2e/fixture-shapes.test.ts` SHAPE001 to verify the SpecGraph
builder does not crash on empty `implements` edges and emits zero `File` nodes
when `FILE_CHANGES.md` has no path rows.

Owned per [.specs/spec-generator-v4/FIXTURES.md#f-21](../../../../.specs/spec-generator-v4/FIXTURES.md).
