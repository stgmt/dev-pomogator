# User Stories

- Как разработчик dev-pomogator, я хочу иметь Linux control-test для npx-установки (CORE003_18), чтобы убедиться что happy path установки через `npx github:stgmt/dev-pomogator` работает в Docker CI на каждом коммите.
- Как разработчик dev-pomogator, я хочу regression Windows-тест (CORE003_19), который фиксирует known silent install failure через failing assertions, чтобы будущий fix-коммитер сразу видел что bug-сценарий покрыт автоматизированной проверкой.
- Как пользователь dev-pomogator на Windows, я хочу чтобы регрессия "молчаливый install" не вернулась после fix-а bug-а, чтобы не оказаться в тупике без диагностики и без понимания что произошло.
- Как пользователь dev-pomogator, столкнувшийся с silent install failure прямо сейчас, я хочу запустить slash-command `/install-diagnostics`, чтобы получить root cause + рекомендованный workaround вместо того чтобы гадать.

---

## Second Failure Mode Stories (2026-04-20, @feature6)

- **US-5 @feature6** Как **first-time installer на Windows PowerShell**, я хочу чтобы команда из README (`npx github:stgmt/dev-pomogator --claude`) работала с первой попытки без silent failure, чтобы я мог зарегистрировать помогатор и двинуться дальше — а не потратить час на debugging пустой папки `_npx/<hash>/`.
- **US-6 @feature6** Как **diagnostic skill user** (мой случай когда reify уже не был нужен, prompt race съел prompt), я хочу чтобы skill различал два failure modes (Mode A = EPERM, Mode B = prompt-race) и выдавал evidence-based recommendation — чтобы я сразу получил правильный fix (`--yes` flag) без попыток cleanup cache и reinstall, которые на prompt-race не помогут.
- **US-7 @feature6** Как **maintainer dev-pomogator**, я хочу CI lint который ломается на PR с `npx github:stgmt/dev-pomogator` без `--yes` в .md файлах, чтобы regression не просочилась обратно в docs через drive-by edits.
- **US-8 @feature6** Как **contributor написавший новый extension**, я хочу чтобы linter сам указал точный file:line нарушения и предложил `--yes` replacement — чтобы не искать полиси по README и не гадать "как правильно писать npx в этом репо".
