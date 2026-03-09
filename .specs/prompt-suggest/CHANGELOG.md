# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Initial spec creation (13 files + BDD .feature)

## [0.1.0] - TBD

### Added
- Stop hook: генерация подсказки через Haiku LLM с v2 промптом
- Submit hook: инжекция подсказки через "+" → additionalContext
- systemMessage с 💡 emoji для визуальной заметности
- Auto-detect API (OpenRouter / aipomogator)
- TTL 10 мин для state file
- Fail-open (exit 0 всегда)
- Silence option (пустой LLM ответ → no state file)
- stop_hook_active guard
