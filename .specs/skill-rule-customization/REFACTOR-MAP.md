# REFACTOR MAP — born-addressable миграция rules/skills

> Карта-оценка для ревью (turn 6). Источник: `Glob .claude/rules/**/*.md` + `.claude/skills/**/SKILL.md`, секции = кол-во `##`/`###` заголовков на файл.
> Дата: 2026-05-28.

## Что считаем рефакторингом (на каждый файл)

- **rule.md** → frontmatter `id` + N section-якорей (`### [<sid>] …`) + объявить merge-стратегию в `extension.json`.
- **SKILL.md** → то же (id + section-якоря); `scripts/*` и `references/*` → стратегия `replace` (3way fallback), НЕ section-адресуются (это код/ассеты).
- Якоря `[<sid>]` codemod проставляет авто из slug заголовка (§10.4 RESEARCH); ручное = только ревью диффа + разрешение коллизий slug.

## Легенда

`§N` — секций (section-id к простановке) · `W1/W2/W3` — волна · `★` — pilot-якорь (валидируем контракт здесь первым).

## Волны (оценка приоритета)

- **W1 — Pilot:** самые прескриптивные + наиболее вероятно кастомизируемые юзером («почти подходит, убрать пункт»). Прогоняем контракт end-to-end до масштабирования.
- **W2 — Workflow/meta:** spec/plan-workflow правила + основные spec-скилы; батчами по папкам.
- **W3 — Low-customization:** correctness-правила, gotchas, reference, внутренние child-скилы, env/niche-скилы. Кастомизируются редко → последними.

---

## Дерево: `.claude/rules/`  (47 файлов · 308 секций)

```
.claude/rules/
├─ [root]
│  ├─ atomic-config-save.md                         §3   W3
│  ├─ atomic-update-lock.md                          §3   W3
│  ├─ no-unvalidated-manifest-paths.md               §5   W3
│  ├─ jira-smart-commit-one-line.md                  §5   W3
│  ├─ claude-md-glossary.md                          §5   W3
│  ├─ updater-sync-tools-hooks.md                    §3   W3
│  ├─ updater-managed-cleanup.md                     §5   W3
│  ├─ extension-manifest-integrity.md                §3   W3
│  ├─ ts-import-extensions.md                        §7   W3
│  ├─ extension-layout.md                            §9   W3
│  ├─ extension-test-quality.md                      §9   W3
│  ├─ integration-tests-first.md                     §6   W1
│  └─ tui-pilot-tests.md                             §5   W3
├─ answer-simple/
│  └─ clear-questions-to-user.md                     §14  W1 ★
├─ plan-pomogator/
│  ├─ plan-pomogator.md                              §20  W1 ★
│  ├─ cross-scope-coverage.md                        §13  W2
│  ├─ spec-test-sync.md                              §8   W2
│  ├─ proactive-investigation.md                     §7   W2
│  └─ plan-freshness.md                              §6   W2
├─ pomogator/
│  ├─ no-blocking-on-tests.md                        §12  W1
│  ├─ tui-debug-verification.md                      §10  W1
│  ├─ verify-render-target.md                        §6   W1
│  ├─ screenshot-driven-verification.md              §4   W1
│  └─ post-edit-verification.md                      §3   W1
├─ auto-simplify/
│  └─ simplify-extended.md                           §7   W1
├─ tui-test-runner/
│  └─ centralized-test-runner.md                     §4   W1
├─ specs-workflow/
│  ├─ architecture-decision/
│  │  ├─ escape-hatch-audit.md                       §7   W2
│  │  └─ when-to-build-architecture.md               §5   W2
│  └─ variant-matrix/
│     ├─ escape-hatch-audit.md                       §6   W2
│     └─ when-to-build-matrix.md                     §5   W2
├─ scope-gate/
│  ├─ escape-hatch-audit.md                          §9   W2
│  └─ when-to-verify.md                              §5   W2
├─ onboard-repo/
│  ├─ commands-via-skill-reference.md                §6   W2
│  └─ onboarding-artifact-ai-centric.md              §6   W2
├─ spec-reality-check/
│  └─ maintain-evals-on-edit.md                      §9   W2
├─ suggest-rules/
│  └─ self-improving.md                              §9   W2
├─ test-quality/
│  └─ no-test-helper-duplication.md                  §5   W3
├─ reqnroll-ce-guard/
│  └─ reqnroll-ce-slash.md                           §10  W3
├─ checklists/
│  ├─ hook-install-verification.md                   §6   W3
│  ├─ manifest-test-coverage.md                      §5   W3
│  └─ skill-allowed-tools-audit.md                   §3   W3
└─ gotchas/
   ├─ installer-hook-formats.md                      §7   W3
   ├─ verify-divergent-contracts.md                  §7   W3
   ├─ hook-global-state-cwd-scoping.md               §5   W3
   ├─ docker-no-git-repo.md                          §4   W3
   ├─ plan-todos-single-line-description.md          §4   W3
   └─ wt-split-pane-minimum-size.md                  §3   W3
```

## Дерево: `.claude/skills/`  (28 файлов · 479 секций)

```
.claude/skills/
├─ [W1 — core user-facing]
│  ├─ create-spec/SKILL.md                           §9   W1 ★
│  ├─ research-workflow/SKILL.md                      §22  W1
│  ├─ run-tests/SKILL.md                              §12  W1
│  ├─ strong-tests/SKILL.md                           §37  W1
│  ├─ tests-create-update/SKILL.md                    §12  W1
│  ├─ answer-simple/SKILL.md                          §24  W1
│  └─ worktree-setup/SKILL.md                         §5   W1
├─ [W2 — workflow / spec]
│  ├─ spec-review/SKILL.md                            §20  W2
│  ├─ spec-reality-check/SKILL.md                     §13  W2
│  ├─ verify-generic-scope-fix/SKILL.md              §10  W2
│  ├─ architecture-decision-builder/SKILL.md          §11  W2
│  ├─ skills-rules-optimizer/SKILL.md                 §11  W2
│  ├─ dedup-tests/SKILL.md                            §10  W2
│  ├─ debug-screenshot/SKILL.md                       §9   W2
│  └─ dev-pomogator-uninstall/SKILL.md                §7   W2
└─ [W3 — child / env / niche]
   ├─ discovery-forms/SKILL.md          (child)       §14  W3
   ├─ requirements-chk-matrix/SKILL.md  (child)       §18  W3
   ├─ task-board-forms/SKILL.md         (child)       §16  W3
   ├─ arch-review-loop/SKILL.md         (child)       §6   W3
   ├─ docker-optimize/SKILL.md                        §19  W3
   ├─ install-diagnostics/SKILL.md                    §21  W3
   ├─ deep-insights/SKILL.md                          §23  W3
   ├─ proxy-up/SKILL.md                               §9   W3
   ├─ use-claude-subscription/SKILL.md                §19  W3
   ├─ edge-debug-port/SKILL.md                        §15  W3
   ├─ context-menu/SKILL.md                           §26  W3
   ├─ hyperv-test-runner/SKILL.md                     §27  W3
   └─ setup-windows-test-vm/SKILL.md                  §54  W3
```

## Сводка по волнам

| Волна | Rules | Skills | Файлов | Секций (≈) | Что в ней |
|-------|------:|-------:|-------:|-----------:|-----------|
| **W1 (pilot)** | 9 | 7 | 16 | ~190 | прескриптивные правила + core-скилы; валидируем контракт |
| **W2** | 16 | 8 | 24 | ~250 | workflow/meta правила + spec-скилы |
| **W3** | 22 | 13 | 35 | ~350 | correctness/gotchas/reference + child/env/niche скилы |
| **Итого** | **47** | **28** | **75** | **~787** | |

## Наблюдения / риски для оценки

- **Тяжёлые файлы** (много section-id): `setup-windows-test-vm`(54), `strong-tests`(37), `hyperv-test-runner`(27), `context-menu`(26), `answer-simple`-skill(24), `deep-insights`(23), `research-workflow`(22), `plan-pomogator`-rule(20). Здесь slug-коллизии вероятнее → ревью внимательнее.
- **Child-скилы** (`discovery-forms`, `requirements-chk-matrix`, `task-board-forms`, `arch-review-loop`) приватны к specs-workflow/loop — кастомизируются редко, но section-id всё равно нужны для консистентности (W3).
- **Script-heavy скилы** — section-рефактор только для SKILL.md; `scripts/**` идут `replace`. Реальный объём адресуемого меньше 479, т.к. часть «секций» в скилах — про код/CLI.
- Парные `escape-hatch-audit.md` (scope-gate / architecture-decision / variant-matrix) структурно похожи → codemod-шаблон переиспользуется.
- **Не входит в section-рефактор:** все `*.ts` tools, `extensions/*/extension.json` (туда лишь добавляется `mergeStrategy` + `id`-реестр).

## Следующий шаг (после твоего ревью карты)

1. Подтвердить разбивку по волнам (или переставить приоритеты).
2. PoC codemod на **W1-pilot** (`plan-pomogator.md` + `create-spec/SKILL.md`): авто-slug → section-якоря, проверить коллизии + CRLF (§10.5).
3. Только потом — полная спека (FR из §8/§11/§12 RESEARCH).
