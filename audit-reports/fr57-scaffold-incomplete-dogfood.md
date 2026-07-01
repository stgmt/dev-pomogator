# FR-57 dogfood — «готовые» спеки с недописанной прозой

Прогон классификатора scaffold-сентинелов (159 образцов) по 66 спекам корпуса. Спека считается «готовой», если её фаза Finalization подтверждена. Находка = документ дословно содержит незаполненный шаблонный плейсхолдер вне блоков кода. Документ фикстур учитывается как блокирующий только если проект реально использует тестовые данные.

- **Готовы, но недописаны → красные:** 8
- **Готовы и честно чисты → зелёные:** 20
- **Ранняя фаза (недоделки ожидаемы, только пометка):** 11

## Готовые спеки с реальными недоделками (по убыванию)

| Спека | Всего заглушек | По документам |
|-------|----------------|---------------|
| `docker-win-test` | 61 | USE_CASES.md:15, REQUIREMENTS.md:6, NFR.md:4, ACCEPTANCE_CRITERIA.md:16, FIXTURES.md:15, TASKS.md:17, CHANGELOG.md:3 |
| `global-dir-guard` | 15 | FIXTURES.md:15 |
| `install-diagnostics` | 15 | FIXTURES.md:15 |
| `tui-statusline-mode` | 3 | CHANGELOG.md:3 |
| `onboard-repo-phase0` | 2 | USE_CASES.md:2 |
| `answer-simple` | 1 | TASKS.md:1 |
| `dev-pomogator-canonical-plugin` | 1 | TASKS.md:1 |
| `skill-listing-budget` | 1 | TASKS.md:1 |

## Честно чистые готовые спеки

`architecture-decision-builder`, `bg-task-guard`, `claude-mem-integration`, `codex-cli-support`, `create-specs-bdd-enforcement`, `cursor-dead-code-cleanup`, `extension-beta-flag`, `lsp-setup`, `native-statusline`, `plan-pomogator-plain-language`, `plan-pomogator-prompt-isolation`, `pomogator-doctor`, `skills-rules-optimizer`, `spec-reality-check`, `specs-management-as-skill`, `stale-build-guard`, `strong-tests`, `tests-create-update`, `verify-generic-scope-fix`, `worktree-setup`

## Метод

Сгенерировано `tools/specs-generator/scaffold-sentinels.mjs` (FR-57 / Phase 30). Классификатор откалиброван на этом же корпусе: исключены словари допустимых значений, рабочие ссылки-якоря, техтокены, примеры внутри блоков кода.
