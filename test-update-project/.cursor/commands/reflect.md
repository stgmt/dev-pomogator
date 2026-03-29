---
description: "Просмотр и управление очередью автозахваченных сигналов"
---

# /reflect — Learnings Queue Manager

Просмотр и управление очередью автозахваченных сигналов из `.dev-pomogator/learnings-queue.json`.

---

## Шаг 1: Прочитать очередь

Read `.dev-pomogator/learnings-queue.json`.

Если файл не существует → вывести:
```
📥 Learnings Queue — пуста

Сигналы появятся автоматически при работе.
Hooks capture.ts отслеживает коррекции (T2), повторы (T3), workaround-ы (T6) и explicit markers (T5).
```
→ завершить.

## Шаг 2: Показать таблицу

Вывести все entries:

```
📥 Learnings Queue — {имя проекта из cwd}

| # | Trigger | Signal | Confidence | Count | Age | Status |
|---|---------|--------|------------|-------|-----|--------|
| 1 | T2 | use bun not npm | 0.90 | 1 | 2h | pending |
| 2 | T6 | workaround for CRLF | 0.70 | 1 | 1d | pending |
| ... |

📊 Stats: N total, N pending, N consumed, N rejected
```

**Age** = human-readable время с момента `timestamp` (минуты/часы/дни).

## Шаг 3: Обработка аргумента

Если передан аргумент:

### `reject N`
- Найти entry #N в таблице
- Установить `status = "rejected"` в queue файле
- Вывести: `❌ Entry #N rejected: {signal}`

### `clear`
- Удалить все entries с `status === "consumed"` или `status === "rejected"`
- Вывести: `🧹 Удалено N entries (consumed: X, rejected: Y)`

### `stats`
- Подробная статистика:
```
📊 Learnings Queue Stats

По trigger:
  T2 (User Correction): N entries
  T3 (Repeated Confusion): N entries
  T5 (Explicit Marker): N entries
  T6 (Workaround): N entries

По status:
  pending: N
  consumed: N
  rejected: N

По source:
  UserPromptSubmit: N
  Stop: N

Oldest pending: {age}
Most repeated: {signal} (count: N)
```

### Без аргумента
- Показать таблицу + предложить действия:
```
💡 Actions:
- reject N — пометить entry N как rejected
- clear — удалить consumed/rejected entries
- stats — подробная статистика
- 0 — выход
```

## Шаг 4: Обновление файла

При `reject` или `clear` — обновить `.dev-pomogator/learnings-queue.json` через Read → Edit.
