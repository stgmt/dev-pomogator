# FR

## Description — negative test for fenced code skip

The path in fenced code block below MUST NOT trigger NARRATIVE_PATH_MISSING.

```typescript
// Example code:
import { foo } from './src/totally_missing_v2.ts';
```

If skill correctly skips fenced blocks, this fixture emits 0 NARRATIVE findings.
