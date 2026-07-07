# claude-mem File Read Gate — анализ issue #86 (проверено кодом + живым прогоном)

**Дата:** 2026-07-04 · **Issue:** [#86](https://github.com/stgmt/dev-pomogator/issues/86) (OPEN) · **Автор:** stgmt
**Установленная версия claude-mem:** worker 13.9.3 (live, PID 36848, порт 37777), кэш 13.8.0/13.8.1/13.9.1/13.9.2

> **Коррекция.** Первая версия этого отчёта (и сам issue) утверждала, что gate **денаит** Read и
> подсовывает выжимку, а инвалидации по mtime нет. **Это неверно.** Первая версия доверилась
> upstream-доке `file-read-gate.mdx`; прогон реального кода воркера + живой драйв хука показали
> другое. Ниже — проверенная реальность (дисциплина `verify-against-real-artifact`: код и живой
> артефакт — истина, дока — нет).

---

## TL;DR / вердикт

**Центральное утверждение issue #86 — про установленную версию НЕВЕРНО.** Ни в одной установленной
версии claude-mem (13.8.0 → 13.9.3) file-context хук **не денаит** Read и **не подменяет** байты
файла. Он:

1. Возвращает `permissionDecision:"allow"` — **Read всегда проходит**, агент получает настоящий файл.
2. Только для файлов **с заметками** И **не изменённых с момента обучения** (`mtime < самой свежей
   заметки`) — **добавляет** датированный таймлайн прошлых observations как `additionalContext`,
   с явной пометкой *«prior observations — supplementary context follows. The Read result below is
   the full requested section»*.
3. Для изменённых-с-обучения файлов и файлов без заметок — не добавляет ничего (чистое чтение).

Значит **корректностный вред, которого боится issue (протухшая подмена → тихие ошибки),
не материализуется**: настоящие байты читаются всегда; таймлайн — аддитивный, датированный,
и появляется только когда он ещё актуален (файл не менялся). Upstream-дока всё ещё описывает
СТАРУЮ deny-модель — **дока протухла относительно кода**.

Отдельный, реальный вред — **зависание воркера** (мёртвый воркер → `exit 2` блокирует tool-calls) —
существует и **уже закрыт** твоим reaper'ом от 3 июля (`262b5206`).

---

## Улики (перепроверяемые)

### 1. Кода deny-гейта в бандле НЕТ — во всех установленных версиях

`grep` по каждому установленному `worker-service.cjs`:

| Версия | `"Read blocked"` (deny-текст доки) | `permissionDecision:"deny"` | `permissionDecision:"allow"` | «supplementary context follows» (augment) |
|---|---|---|---|---|
| 13.8.0 | 0 | 0 | 1 | 1 |
| 13.8.1 | 0 | 0 | 1 | 1 |
| 13.9.1 | 0 | 0 | 1 | 1 |
| 13.9.2 | 0 | 0 | 1 | 1 |
| 13.9.3 (live) | 0 | 0 | 1 | 1 |
| marketplace | 0 | 0 | 1 | 1 |

Единственный `deny` в файле — на строке 1925, и это несвязанное: Zod-schema `describe("...paths to
deny reading within the sandbox...")` про sandbox-Read, не про memory-gate.

### 2. Реальная логика (функция `i4e`, деобфусцировано)

```js
async function fileContextGate(input, filePath) {
  let mtimeMs = 0;
  try {
    const st = statSync(resolve(cwd, filePath));
    if (!st.isFile() || st.size < 1500) return null;   // мелкие/не-файлы → чистое чтение
    mtimeMs = st.mtimeMs;
  } catch (e) {
    if (e.code === "ENOENT") return null;              // файла нет → чистое чтение
    /* иная ошибка stat → mtimeMs=0, freshness-проверка ниже пропустится */
  }
  const obs = await GET(`/api/observations/by-file?...`);
  if (!obs || obs.observations.length === 0) return null;   // нет заметок → чистое чтение
  if (mtimeMs > 0) {
    const newest = Math.max(...obs.observations.map(o => o.created_at_epoch));
    if (mtimeMs >= newest) return null;   // ФАЙЛ ИЗМЕНЁН ПОСЛЕ ОБУЧЕНИЯ → чистое чтение (нет augment)
  }
  return buildAugment(...);   // permissionDecision:"allow" + датированный таймлайн как additionalContext
}
```

- **Единицы совпадают** (проверено по БД): `observations.created_at_epoch` = `1783125875246`
  (13 цифр = **миллисекунды**, как `mtimeMs`). Сравнение `mtimeMs >= newest` корректно.
- `buildAugment` НИКОГДА не ставит `deny` — только `allow` + additionalContext.
- stat-ошибка (не ENOENT) → freshness пропускается → augment всё равно, но это по-прежнему
  **allow** (реальные байты читаются) + датированный таймлайн — не тихая подмена. Безвредно.

### 3. Живой драйв хука (решающая улика, без мутаций)

Подал реальный Read-payload в `worker-service.cjs hook claude-code file-context` против двух
реально обученных файлов, выбранных из БД воркера:

| Файл | Состояние | Предсказание | Факт |
|---|---|---|---|
| `E:\repos\lm-saas\.claude\settings.local.json` (17 КБ) | не менялся с обучения (mtime на 25ч старше заметки) | augment | ✅ **allow + таймлайн** («The Read result below is the full requested section») |
| `C:\Users\stigm\.headroom\savings_events.jsonl` (285 КБ) | изменён после обучения (mtime на 27мин новее) | чистое чтение | ✅ **`{}`** (freshness-гейт пропустил) |

Ни один прогон не вернул deny.

---

## Пересборка двух «вредов» issue

| Вред | Что заявлял issue | Проверенная реальность |
|------|-------------------|------------------------|
| **Корректность** (протухшая подмена → тихие ошибки) | Read денается, вместо байтов — старая выжимка | **НЕ ПРИСУТСТВУЕТ.** Read всегда allow; таймлайн аддитивный, датированный, и только для НЕ-изменённых файлов. Подмены нет |
| **Доступность** (мёртвый воркер → `exit 2` блок) | Каскад Stop/Read-фейлов при мёртвом воркере | **РЕАЛЬНО, но уже закрыто** reaper'ом `262b5206` (SessionStart: убить orphan на 37777 + сброс `hook-failures.json`) + doctor `C-CMEM-W` |

Побочно: раз gate ничего не денаит, а augment **добавляет** таймлайн в контекст — фича сейчас
скорее **тратит** токены (немного, только на не-изменённых обученных файлах ≥1500 байт), а не
экономит их «блокировкой чтения», как предполагает issue.

---

## Четыре запроса issue → фактический статус (пересмотрено)

| # | Запрос | Статус | Обоснование |
|---|--------|--------|-------------|
| **1** | НЕ вшивать Read-**deny**-gate по умолчанию / исключать репо | ⚪ **МOOT** | Deny-гейта нет ни в одной установленной версии. Исключать нечего; `CLAUDE_MEM_EXCLUDED_PROJECTS` тут не нужен |
| **2** | Health-gate + чистка hook-failures | 🟢 **СДЕЛАНО** (для реального вреда — доступности) | Reaper сбрасывает `hook-failures.json` и лечит воркер на SessionStart |
| **3** | Гасить orphan-воркер при деинсталле | 🟢 **СДЕЛАНО** | `uninstall.ps1` бьёт PID из `worker.pid` + kill по порту 37777 |
| **4** | Документировать компромисс gate | 🟡 **ПОЛЕЗНЫЙ ОСТАТОК** | Документировать НАДО, но точную реальность: gate = allow+augment, freshness-gated, а не deny. И зафиксировать дрейф upstream-доки |

---

## Рекомендация

1. **Никакого exclude-project / disable-gate фикса не требуется** — «баг» issue не воспроизводится
   в установленных версиях. Мой первый совет (исключить проект) был неверен дважды: это (а) фикс
   симптома, (б) симптома, которого нет.
2. **Скорректировать/закрыть issue #86** этой уликой: центральная посылка (deny + протухшая
   подмена) неверна для 13.8–13.9; upstream-дока `file-read-gate.mdx` описывает удалённую deny-модель.
   Оставить как «doc-drift / claim-not-reproduced», либо закрыть.
3. **Единственное реальное действие из #86 — доступностное — уже сделано** (reaper). Отдельных
   правок не требует.
4. **Caveat охвата:** проверено на установленных версиях этого бокса (13.8.0–13.9.3 — все
   augment-only). Гипотетически на сильно более старой версии claude-mem deny-модель могла быть
   активной (дока её описывает) — но ни одна установленная копия её не содержит. Если важно —
   можно проверить историю thedotmack/claude-mem, в какой версии deny→augment переключили.

**Границы отчёта:** только анализ. Фикс/спеку не начинал; в issue #86 ничего не постил.

---

## Пруфы / источники

- **Код воркера** (все версии): `~/.claude/plugins/{cache/thedotmack/claude-mem/*,marketplaces/thedotmack/plugin}/scripts/worker-service.cjs` — `"Read blocked"`=0, `permissionDecision:"deny"`=0, только `"allow"`; функция `i4e` (freshness `mtimeMs>=max(created_at_epoch)` → skip).
- **БД воркера**: `~/.claude-mem/claude-mem.db` (SQLite) — таблица `observations`, `created_at_epoch` в миллисекундах (образец `1783125875246`); столбцы `files_read`/`files_modified`/`content_hash`.
- **Живой драйв**: `worker-service.cjs hook claude-code file-context` против 2 реальных обученных файлов → allow+augment (не-изменённый) / `{}` (изменённый).
- **Установленный `hooks.json`**: 1×`PreToolUse matcher:"Read"` → `file-context` (хук есть, но его поведение — allow+augment, не deny).
- **Upstream дока (устарела)**: `docs/public/file-read-gate.mdx` описывает deny-модель, которой в коде нет.
- **Доступностный вред**: `tools/claude-mem-health/health-check.ts` (reaper, `262b5206`), `audit-reports/claude-mem-worker-handle-leak-upstream.md`, `uninstall.ps1` (kill 37777).
- **dev-pomogator footprint**: `tools/claude-mem-bootstrap/install-claude-mem.ts`, reaper, doctor `C-CMEM`/`C-CMEM-W`, спека `.specs/claude-mem-integration/`.
