---
paths:
  - "tests/**"
  - "Dockerfile*"
  - ".dockerignore"
---

# Docker Test Environment Has No .git

`.dockerignore` excludes `.git` directory. Any test or hook that calls `git diff`, `git log`, `git status` etc. will fail with "Not a git repository" inside Docker containers.

## Антипаттерн

```typescript
// BAD: assumes .git exists in Docker
const diff = execSync('git diff --numstat', { cwd: appPath() });
```

## Пример из практики

`simplify-stop.test.ts` тест "should skip when max retries exceeded" падал в Docker потому что hook вызывает `git diff --numstat`, но `.git` отсутствует. `initGitRepo()` из helpers.ts создаёт **фейковый** `.git` (только HEAD + config) — недостаточно для `git diff`.

## Как правильно

Добавить env var override чтобы hook мог работать без реального git:

```typescript
// В production коде (hook):
const override = process.env.SIMPLIFY_DIFF_OVERRIDE;
if (override) {
  const files = override.split(',').map(f => f.trim()).filter(Boolean);
  return { totalLines: files.length * 10, fileList: files };
}
// Fallback to real git diff
const raw = execSync('git diff --numstat', { ... });
```

```typescript
// В тесте:
const result = runStopHook(defaultInput(), {
  SIMPLIFY_DIFF_OVERRIDE: 'src/test.ts,src/test2.ts',
});
```

## Чеклист

- [ ] Hook/скрипт вызывает git команды? → добавить env override для тестов
- [ ] `initGitRepo()` из helpers.ts = фейковый `.git` (HEAD + config only) — НЕ для `git diff`
- [ ] Для реального git в Docker: `git init && git add && git commit` (не initGitRepo)
- [ ] `.dockerignore` содержит `.git` — это правильно, не удалять
