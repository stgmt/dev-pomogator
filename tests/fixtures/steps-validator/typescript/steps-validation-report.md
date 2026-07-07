# Steps Validation Report

Generated: 2026-06-24T15:52:20.460Z
Language: typescript

## Summary

| Status | Count |
|--------|-------|
| ✅ GOOD | 3 |
| ⚠️ WARNING | 6 |
| ❌ BAD | 6 |

**Total steps analyzed:** 15
**Files analyzed:** 2

---

## ❌ BAD Steps (6)

| File | Line | Type | Pattern | Issues |
|------|------|------|---------|--------|
| `bad.steps.ts` | 14 | Then | `the result is verified` | Only logging, no assertion, Warning pattern detected |
| `bad.steps.ts` | 20 | Then | `the operation completes` | Empty body |
| `bad.steps.ts` | 23 | Then | `the data is processed` | Empty body, Bad pattern detected |
| `bad.steps.ts` | 28 | Then | `the validation passes` | Pending implementation, Bad pattern detected |
| `bad.steps.ts` | 33 | Then | `the feature works` | Only logging, no assertion, TODO/FIXME comment found |
| `bad.steps.ts` | 39 | Then | `the log is written` | Only logging, no assertion, Warning pattern detected |


## ⚠️ WARNING Steps (6)

| File | Line | Type | Pattern | Issues |
|------|------|------|---------|--------|
| `good.steps.ts` | 7 | Given | `a valid setup` | Warning pattern detected |
| `good.steps.ts` | 13 | When | `an action is performed` | Warning pattern detected |
| `good.steps.ts` | 19 | Then | `the result is {string}` | Warning pattern detected |
| `good.steps.ts` | 35 | Then | `the operation succeeds` | Warning pattern detected |
| `bad.steps.ts` | 5 | Given | `a bad setup` | TODO/FIXME comment found |
| `bad.steps.ts` | 9 | When | `bad action happens` | Warning pattern detected |


## ✅ GOOD Steps (3)

<details>
<summary>Click to expand</summary>

| File | Line | Type | Pattern |
|------|------|------|---------|
| `good.steps.ts` | 25 | Then | `the result is not null` |
| `good.steps.ts` | 30 | Then | `the result contains {string}` |
| `good.steps.ts` | 43 | Then | `the data is valid` |

</details>


---

## Files Analyzed

- `good.steps.ts`
- `bad.steps.ts`
