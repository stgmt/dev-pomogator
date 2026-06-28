# Cucumber-js step strings: parens are OPTIONAL text — use a RegExp for literal `(...)`

When you author a cucumber-js step definition as a **plain STRING** (`Given('...')` /
`When('...')` / `Then('...')`), cucumber-js parses it as a **Cucumber Expression**, where
`( )` denotes **optional text** — NOT a literal parenthesis. So a step string containing
`(view coverage)` matches the step text WITHOUT those words, and **never matches a `.feature`
step that contains the literal `(view coverage)`** → the step is reported **UNDEFINED**.

This is the cucumber-js analogue of the Reqnroll/SpecFlow gotcha in
[[reqnroll-ce-slash]] (there `/` is the special char; here it's `( )`).

## Antipattern (real, incident 2026-06-28)

```ts
// .feature step:  When get_spec_status (view coverage) is called scoped to one spec and then bare
When('get_spec_status (view coverage) is called scoped to one spec and then bare', fn); // ❌ UNDEFINED
```

`(view coverage)` is read as optional → the literal-paren `.feature` step is unmatched. The
vitest suite + bespoke runtime probes were all green; only the **full BDD run** surfaced it
(`spec-generator-v4` showed `1 undefined`). A name-grep "is it mine?" check also missed it
because the scenario node id is hyphen-lowercased (`specgen004-143`), not `SPECGEN004_143`.

## Correct — RegExp with escaped parens (or drop the parens)

```ts
// ✅ a RegExp object is ALWAYS treated as a regex → literal parens via \(...\)
When(/^get_spec_status \(view coverage\) is called scoped to one spec and then bare$/, fn);
```

Other Cucumber-Expression specials to escape/avoid in STRING steps when you mean them
literally: `( )` (optional), `{ }` (parameter), `/` (alternative), `\` (escape).

## Rule

- A step whose `.feature` text contains a **literal** `(`, `)`, `{`, `}`, or `/` MUST be a
  **RegExp** step-def (escape the char: `\(`, `\)`, `\{`, `\/`), not a plain string.
- Prefer RegExp for any step you rewrite, so a later literal char can't silently turn the
  match off.
- Verifying via vitest / a bespoke handler probe is NOT enough — **only the real cucumber run**
  binds step text ↔ definition. A renamed/edited step is unconfirmed until the BDD suite (Docker)
  shows its scenario PASSED (not just "not in the failure list" — match on the **slug-format**
  node id `specgen004-NN`, not `SPECGEN004_NN`).

## Checklist (after editing a step regex/text)

- [ ] Step text has a literal `(`/`)`/`{`/`}`/`/`? → step-def is a RegExp with that char escaped.
- [ ] `.feature` text and the step-def changed **together** (text ↔ binding stay paired).
- [ ] Confirmed by a real Docker BDD run (`docker-bdd.sh --name "SPECGEN004_NN"` is clobber-safe),
      checking the scenario's `lastResult === PASSED` by its slug id — not by absence from the fail list.

## История

Создано 2026-06-28 после слияния `get_coverage`/`get_coverage_summary` → `get_spec_status(view)`:
один из шести переписанных шагов (`SPECGEN004_143`) был оставлен СТРОКОЙ с `(view coverage)`,
ушёл в UNDEFINED; поймал только полный Docker-прогон. Остальные пять были регэкспами и прошли.
Фикс — регэксп с `\(view coverage\)`, подтверждён точечным прогоном (1 scenario / 1 passed).

## Связанные

- `.claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md` — тот же класс для Reqnroll/SpecFlow (`/`).
- `.claude/rules/testing/verify-against-real-artifact.md` — «зелёный юнит ≠ реальная связка»; здесь связка = step text ↔ definition, доказывается только cucumber-прогоном.
- `.claude/rules/extension-test-quality.md` — 1:1 mapping it()/Scenario; здесь — механика самого матча шага.
