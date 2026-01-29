# Steps Validation Report

Generated: 2026-01-28T16:03:58.699Z
Language: csharp

## Summary

| Status | Count |
|--------|-------|
| ✅ GOOD | 13 |
| ⚠️ WARNING | 0 |
| ❌ BAD | 14 |

**Total steps analyzed:** 27
**Files analyzed:** 2

---

## ❌ BAD Steps (14)

| File | Line | Type | Pattern | Issues |
|------|------|------|---------|--------|
| `BadSteps.cs` | 20 | Then | `the result is verified` | Only logging, no assertion |
| `BadSteps.cs` | 28 | Then | `the operation completes` | Empty body |
| `BadSteps.cs` | 34 | Then | `the data is processed` | Bad pattern detected |
| `BadSteps.cs` | 41 | Then | `the feature works` | Bad pattern detected |
| `BadSteps.cs` | 48 | Then | `the validation passes` | Pending implementation, Bad pattern detected |
| `BadSteps.cs` | 55 | Then | `the system responds` | Pending implementation, Bad pattern detected |
| `BadSteps.cs` | 62 | Then | `the log is written` | Only logging, no assertion, TODO/FIXME comment found |
| `BadSteps.cs` | 70 | Then | `the API is called` | Only logging, no assertion, Warning pattern detected |
| `BadSteps.cs` | 77 | Then | `the cache is updated` | Only logging, no assertion, Warning pattern detected |
| `BadSteps.cs` | 84 | Then | `all items have type ""(.*)""` | Only logging, no assertion |
| `BadSteps.cs` | 93 | Then | `all items are updated` | Only logging, no assertion |
| `BadSteps.cs` | 101 | Then | `missing IDs are skipped` | Only logging, no assertion, Warning pattern detected |
| `BadSteps.cs` | 109 | Then | `the API returns token` | Bad pattern detected, Warning pattern detected |
| `BadSteps.cs` | 122 | Then | `the system logs ""(.*)"" at (.*) level` | Only logging, no assertion |


## ⚠️ WARNING Steps

None found.


## ✅ GOOD Steps (13)

<details>
<summary>Click to expand</summary>

| File | Line | Type | Pattern |
|------|------|------|---------|
| `GoodSteps.cs` | 22 | Given | `a valid setup` |
| `GoodSteps.cs` | 30 | When | `an action is performed` |
| `GoodSteps.cs` | 38 | Then | `the result is ""(.*)""` |
| `GoodSteps.cs` | 46 | Then | `the result is not null` |
| `GoodSteps.cs` | 53 | Then | `the result contains ""(.*)""` |
| `GoodSteps.cs` | 60 | Then | `the operation succeeds` |
| `GoodSteps.cs` | 72 | Then | `the data is valid` |
| `GoodSteps.cs` | 79 | Then | `the page URL matches ""(.*)""` |
| `GoodSteps.cs` | 89 | Then | `the element is visible` |
| `GoodSteps.cs` | 120 | Then | `the result contains (\d+) items` |
| `GoodSteps.cs` | 136 | Then | `the result is not empty` |
| `GoodSteps.cs` | 147 | Then | `the token exists` |
| `GoodSteps.cs` | 160 | Then | `the data is validated:` |

</details>


---

## Files Analyzed

- `GoodSteps.cs`
- `BadSteps.cs`
