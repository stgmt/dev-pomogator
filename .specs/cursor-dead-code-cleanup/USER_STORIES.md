# User Stories

- Как разработчик dev-pomogator, я хочу убрать мёртвые Cursor-функции из memory.ts, чтобы файл содержал только live-код и был читабельнее (1070 → ~655 строк). @feature1 @feature2
- Как разработчик dev-pomogator, я хочу убрать мёртвые Cursor-функции из updater/index.ts, чтобы не было unreachable `.cursor` веток и unused interfaces. @feature3 @feature4
- Как разработчик dev-pomogator, я хочу убедиться что shared-функции (ensureClaudeMem) и существующие тесты работают после cleanup. @feature5 @feature6
