# Use Cases

## UC-1: Display Test Progress @feature1

**Actor:** Developer running tests

**Precondition:** Test runner wrapper is active

**Main Flow:**
1. Test wrapper writes status to `status.{session_id_prefix}.yaml`
2. Statusline reads YAML and renders `{passed}/{total} {percent}%`
3. Progress bar shows `{bar}` with Unicode blocks

**Postcondition:** Developer sees real-time progress in statusline

## UC-2: Multiple Session Isolation @feature2

**Actor:** Developer with parallel tests

**Precondition:** Two test sessions running simultaneously

**Main Flow:**
1. Each session gets unique `{session_id}` from `TEST_STATUSLINE_SESSION={prefix}`
2. Status files are namespaced: `.test-status/status.{sid}.yaml`
3. Statusline renders the most recent session

**Postcondition:** No data cross-contamination between sessions
