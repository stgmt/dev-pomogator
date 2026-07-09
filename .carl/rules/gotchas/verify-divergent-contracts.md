# Verify Divergent Contracts

Когда два источника истины описывают **одно и то же поведение, но по-разному** — это design conflict, а не "один прав, другой нет". Читай ОБА перед резолюцией. Не удаляй сторону без понимания зачем она была добавлена.

## Источники истины которые могут расходиться

- **Tests vs evals** — unit/e2e тесты vs eval-suite skill-а (`evals.json`, `aggregate.json`)
- **Spec vs implementation** — `.specs/{slug}/FR.md` / `ACCEPTANCE_CRITERIA.md` vs код
- **SKILL.md mission vs allowed-tools** — workflow описывает `AskUserQuestion`, frontmatter не объявляет
- **CLAUDE.md vs `.claude/rules/*.md`** — индекс vs тело правила
- **extension.json `skills.{name}` vs `skillFiles.{name}`** — source path vs target paths
- **Test ожидание vs production runtime** — assertion на `[]` vs реальный output `[INFO]`

## Антипаттерн

Тест падает с `expected [] to deeply equal []` (получает `[1 item]`). Слепо удалить эмиттер чтобы тест прошёл.

```typescript
// КАК ДЕЛАЛ (плохо)
// Test: expect(findings).toEqual([]);
// Code: findings.push({ code: 'MATRIX_COMPLETE', severity: 'INFO', ... })
// → удалил push → тест passed
```

Не открыл `evals.json` — там контракт **explicitly требует** `MATRIX_COMPLETE` INFO finding (positive signal, iteration-2 deliberate evolution). Удаление эмиттера сломало бы 36/36 evals.

## Последствия

- Регрессия в **намеренно добавленной** фиче (intentional design → удалён без заметки)
- Eval-suite ломается в следующий запуск, никто не замечает до next iteration
- Reviewer смотрит на test-passed PR и пропускает на ревью
- "Test wins" дисциплина → false sense of safety

## Как правильно

Когда расхождение замечено:

1. **Открой ВТОРОЙ источник** — `evals.json`, `SKILL.md` body, parent spec, sibling test, eval results — что бы ни описывало то же поведение.
2. **Сформулируй конфликт** — "Test ожидает A, eval ожидает B. Какой prevailed first? Какой намеренный?"
3. **Найди history** — git log на эмиттер; commit message часто фиксирует intent ("Iteration-2: emit MATRIX_COMPLETE INFO finding для positive signal").
4. **Спроси юзера / решай явно** — "это design conflict; удалить INFO emit (test wins) или обновить test (eval wins)?"
5. **Если выбираешь сторону — обнови вторую** — не оставляй orphan контракт.

```typescript
// КАК НАДО — после чтения evals.json
// Iteration-2 deliberate: emit MATRIX_COMPLETE INFO для positive signal
// Test устарел — обновить assertion на ожидание INFO finding

// audit.ts: оставить emit
findings.push({ code: 'MATRIX_COMPLETE', severity: 'INFO', ... });

// test: обновить ожидание
expect(findings.filter((f) => f.severity === 'WARNING')).toEqual([]);
const complete = findings.find((f) => f.code === 'MATRIX_COMPLETE');
expect(complete).toBeDefined();
```

## Триггеры — когда обязательно проверять оба

- **Любая правка которая делает падающий тест зелёным удалением кода** — high risk случай
- **Skill/feature имеет evals/** — `evals.json` тоже контракт, не только тесты
- **Существует `references/` рядом со SKILL.md** — может содержать invariants
- **PR описание упоминает "iteration-N enhancements"** — намеренная evolution, читай changelog
- **Юзер спросил "артефакты проверил?" / "ты точно посмотрел evals?"** — sign того что упустил источник

## Чеклист перед удалением кода чтобы починить тест

- [ ] Прочитал ВЕСЬ парный контракт (evals.json, SKILL.md, spec body)?
- [ ] Проверил git log/blame на удаляемую строку — есть ли intent comment?
- [ ] Если эмиттер часть семейства (e.g. INFO findings: `MATRIX_COMPLETE`, `HARD_OUT_DETECTED`, `ESCAPE_HATCH_USED`) — почему именно один лишний?
- [ ] Если выбираю сторону теста — eval/spec тоже обновлён в том же коммите?
- [ ] Сформулировал юзеру: "Это design conflict, выбираю X потому что Y" (а не "test wins, удаляю")?

## Связанные правила

- `.claude/rules/integration-tests-first.md` — почему unit-only недостаточно как контракт
- `.claude/rules/extension-test-quality.md` — 1:1 mapping test ↔ feature scenario
