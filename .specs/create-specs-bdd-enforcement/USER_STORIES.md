# User Stories

- Как tech lead, я хочу чтобы spec-generator при `/create-spec` принудительно выбирал BDD-формат и помечал выбранный фреймворк, чтобы `.feature` артефакты и реальные тесты не расходились. @feature1
- Как разработчик dev-pomogator, я хочу чтобы TASKS.md для новой фичи ставил «Install Reqnroll / Cucumber.js / pytest-bdd» и «bootstrap Hooks+fixtures+config» первыми задачами Phase 0, чтобы все implementation таски имели явную зависимость и я не забыл про фундамент. @feature6
- Как агент в multi-module репозитории (solution `.sln` с несколькими test-проектами), я хочу чтобы `analyze-features.ts` рекурсивно находил `.feature` во всех папках (включая `Cloud/server/*/Features/`), чтобы не пропускать существующий BDD и переиспользовать его Given/When/Then. @feature3
- Как maintainer workflow, я хочу чтобы state machine блокировала `spec-status.ts -ConfirmStop Requirements` без завершённой Phase 2 Step 6 BDD-классификации, чтобы агент не скипал ассессмент молча. @feature5
