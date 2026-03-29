# Claude-mem Integration

Надёжная установка claude-mem: auto-install health hooks, post-install validation, structured logging, graceful degradation, per-component diagnostics.

## Проблема

claude-mem устанавливается "успешно" но не работает: worker мёртв, chroma не стартует, health hooks не зарегистрированы, MCP указывает на мёртвый сервис. 12 из 20 точек отказа не логируются.

## Решение

- Auto-install `claude-mem-health` extension при `needsClaudeMem=true`
- Post-install health validation (worker + chroma + MCP)
- Per-component install report (worker/chroma/mcp/hooks × ok/warn/fail)
- Structured logging для всех 20 точек отказа
- Graceful degradation: chroma down → basic memory works

## Навигация

| Файл | Описание |
|------|----------|
| [USER_STORIES.md](USER_STORIES.md) | 4 user stories |
| [USE_CASES.md](USE_CASES.md) | 5 use cases |
| [RESEARCH.md](RESEARCH.md) | Аудит: 20 точек отказа, 3 критические проблемы |
| [FR.md](FR.md) | 7 functional requirements |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 7 AC в EARS формате |
| [NFR.md](NFR.md) | Performance, Reliability, Usability |
| [DESIGN.md](DESIGN.md) | 5 компонентов изменений, reuse plan |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix |
| [FILE_CHANGES.md](FILE_CHANGES.md) | 5 файлов edit + 1 create |
| [claude-mem-integration.feature](claude-mem-integration.feature) | 9 BDD scenarios (CORE019) |
