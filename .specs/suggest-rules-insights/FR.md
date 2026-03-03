# Functional Requirements (FR)

## FR-1: Чтение отчёта insights @feature1

Система должна читать файл insights-отчёта из `~/.claude/usage-data/report.html` в рамках Phase -0.5 suggest-rules команды. На Windows `~` раскрывается в домашнюю директорию пользователя. Чтение выполняется через инструмент Read.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-2: Проверка свежести отчёта @feature2

Система должна проверять свежесть отчёта по end_date из строки `.subtitle` формата `"N messages across M sessions (K total) | YYYY-MM-DD to YYYY-MM-DD"`. Порог свежести: 3 дня. Если end_date > 3 дней назад -- отчёт помечается как stale. Если файл отсутствует или Read возвращает ошибку -- insights_mode устанавливается в `"unavailable"` и Phase -0.5 завершается без блокировки.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-устаревший-отчёт-insights-3-дней), [UC-3](USE_CASES.md#uc-3-отчёт-insights-отсутствует)

## FR-3: Извлечение friction categories @feature3

Система должна извлекать friction categories из HTML-элементов с CSS-классом `.friction-category`. Для каждого элемента извлекаются: `.friction-title` (название), `.friction-desc` (описание), `.friction-examples li` (список примеров). Тип кандидата: 🔴 Antipattern или ⚠️ Gotcha.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-4: Извлечение CLAUDE.md suggestions @feature4

Система должна извлекать CLAUDE.md suggestions из HTML-элементов с CSS-классом `.claude-md-item`. Для каждого элемента извлекаются: атрибут `data-text` (текст предложения) и текст `.cmd-why` (обоснование). Тип кандидата: 🟢 Pattern или 📋 Checklist.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-5: Извлечение big wins и usage patterns @feature5

Система должна извлекать big wins из `.big-win` элементов (`.big-win-title` + `.big-win-desc`) и usage patterns из `.pattern-card` элементов (`.pattern-title` + `.pattern-summary` + `.pattern-detail`). Типы кандидатов: 🟢 Pattern, 📋 Checklist.

**Связанные AC:** Покрывается [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) (чтение) + [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-7) (pre-candidates)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-6: Извлечение project areas для обогащения доменов @feature6

Система должна извлекать project areas из `.project-area` элементов (`.area-name` + `.area-count`). Данные используются для обогащения списка доменов в Phase 0.5 (Domain Detection), а не как самостоятельные кандидаты правил.

**Связанные AC:** Нет прямого AC (входные данные для Phase 0.5)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-7: Создание pre-candidates с оценкой релевантности @feature7

Для каждой извлечённой находки из insights система должна создать pre-candidate с оценкой релевантности относительно контекста сессии (из Phase -1 Шаг 1.5). Уровни: HIGH (прямое совпадение с технологиями/доменами/проблемами сессии), MEDIUM (тот же домен, другая проблема), LOW (общее улучшение без привязки к сессии).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-8: Unified mode display @feature8

После завершения Phase -0.5 система должна вывести единую строку режима, показывающую статус всех трёх источников данных: память (🧠), insights (📊) и сессия (📍). Варианты режима: `Full (память + сессия + insights)`, `Full (память + сессия)`, `Insights + Session`, `Session-only`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-8)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен)

## FR-9: Маркер источника в Phase 3 @feature9

В таблицах Phase 3 (Index Output) insights-кандидаты должны отображаться с маркером источника `📊 insights` в колонке "Источник". Если отчёт был stale, маркер должен быть `📊 insights ⚠️`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-свежий-отчёт-insights-доступен), [UC-2](USE_CASES.md#uc-2-устаревший-отчёт-insights-3-дней)

## FR-10: Дедупликация insights с session findings @feature9

При обработке в Phase 1.5 (Abstraction) система должна проверять пересечение insights-находок с session-находками. При совпадении -- merge (session = primary source, insights = дополнительное evidence: "также наблюдалось кросс-сессионно"). Без совпадения -- независимый кандидат с источником `📊 insights`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-10)
**Use Case:** [UC-5](USE_CASES.md#uc-5-insights-находка-совпадает-с-session-находкой)
