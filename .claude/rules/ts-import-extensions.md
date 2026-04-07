# TS Import Extensions — `.ts`, не `.js`

В исходниках расширений (`extensions/**/*.ts`) **все relative imports** обязаны указывать на реальное расширение файла на диске, то есть `.ts`, а не `.js`.

## Правильно

```typescript
// extensions/auto-commit/tools/auto-commit/auto_commit_stop.ts
import { log } from '../_shared/hook-utils.ts';
import { runCore } from './auto_commit_core.ts';
```

## Неправильно

```typescript
import { log } from '../_shared/hook-utils.js';   // ❌ файла .js нет на диске
import { runCore } from './auto_commit_core.js';  // ❌ то же самое
```

## Почему

Хуки запускаются через `tsx-runner.js`, который пробует стратегии в порядке:

1. **Strategy 0** — Node 22.6+ native: `node --experimental-strip-types script.ts`
2. **Strategy 1+** — fallback к `tsx`

**Strategy 0 строго требует** чтобы import specifier указывал на реальный файл. Из официальной документации Node v25.x (https://nodejs.org/api/typescript.html):

> As in JavaScript files, file extensions are mandatory in import statements and import() expressions: `import './file.ts'`, not `import './file'`.

В Node **никогда не было** и **не планируется** флага типа `--experimental-import-extension-rewrite`, который мапил бы `.js` спецификатор на `.ts` файл. Команда Node намеренно выбрала строгое соответствие.

`tsx` (Strategy 1+) спокойно понимает оба формата (`.js` и `.ts`) благодаря своим resolver hooks. Поэтому раньше всё работало через tsx, но Strategy 0 (native) валился с `ERR_MODULE_NOT_FOUND`:

```
loadOrImport (node:internal/modules/esm/loader:242:38)
```

После того как `tsx-runner.js` стал делать fall-through на resolver-ошибках (commit `97a7c86`), хук не падает — но на каждом срабатывании теряется ~200-500ms на провальной попытке Strategy 0. Использование `.ts` спецификаторов закрывает эту дыру: Strategy 0 реально работает, cold start ~50ms вместо 500ms.

## Связь с tsc-convention

Стандартная "tsc convention" — писать `.js` в импортах, потому что компилятор эмитит `.js` файлы и под рантайм спецификатор валиден. Эта convention НЕ работает с native Node strip-types. Для проектов которые **не компилируют** код через tsc (как dev-pomogator — extensions запускаются напрямую через tsx), нужна **обратная** convention: писать `.ts` в импортах.

Если когда-нибудь dev-pomogator начнёт компилировать extensions через tsc — добавить в `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true   // tsc 5.7+
  }
}
```

Это позволит tsc-у rewrite-ить `.ts` → `.js` при эмите.

## Чеклист (для PR review и self-check)

- [ ] Все relative imports в `extensions/**/*.ts` используют `.ts` extension
- [ ] Никаких `.js` спецификаторов на sibling-файлы
- [ ] Регрессионный тест `CORE007_11` проходит — `grep -rn "from '\.[./a-zA-Z_-]*\.js'" extensions/**/*.ts` пусто
- [ ] Если код запускается через tsc — `tsconfig.json` содержит `allowImportingTsExtensions: true`

## Известные исключения

- **Bare imports пакетов** (`import 'fs-extra'`, `import 'fs/promises'`) — не затронуты, они проходят через node_modules resolver и не имеют relative path.
- **`src/` (главный TypeScript codebase)** — компилируется через `tsc`, поэтому `.js` спецификаторы там корректны: tsc эмитит `.js` файлы в `dist/`. Это правило **только для `extensions/`**.

## История

- До commit `97a7c86`: всё валилось у Node 22.6+ пользователей с `loadOrImport` трейсом.
- После `97a7c86`: tsx-runner делает fall-through, хуки работают, но 200-500ms тратится впустую.
- После миграции на `.ts` спецификаторы: Strategy 0 реально работает, cold start ~50ms.

См. также: `.claude/rules/extension-manifest-integrity.md`, `.claude/rules/updater-sync-tools-hooks.md`.
