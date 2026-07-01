# Каждый Scenario несёт @FR-N тег требования, которое он описывает (conformance UNTAGGED_SCENARIO).
# Документирующая фича: фиксирует поведение, реализованное в validate-plan.ts Phase 4 (commit 8e33904).
Feature: PLANEV001 — План-помогатор enforce'ит пруфы у фактов

  Background:
    Given план в формате plan-pomogator
    And валидатор tools/plan-pomogator/validate-plan.ts

  @FR-1
  Scenario: PLANEV001_01 Plan with an unsourced claim is flagged in Phase 4
    Given буллет с внешним фактом через claim-глагол (например "поддерживает") без метки-пруфа
    And в плане нет секции "🔎 Источники / Пруфы"
    When запускается Phase 4 валидатора (validateEvidence)
    Then выдаётся warning, что внешние факты не подкреплены (нет секции Источники)
    And буллет помечается как похожий на непроверенный факт без метки-пруфа

  @FR-2
  Scenario: PLANEV001_02 Plan whose facts carry proof markers passes the evidence check clean
    Given каждый внешний факт несёт метку [src:url] / [ref:file:line] / [cmd:вывод]
    And в плане есть секция "🔎 Источники / Пруфы" хотя бы с одним пруфом
    When запускается Phase 4 валидатора (validateEvidence)
    Then ни одного warning про непод­креплённые факты не выдаётся
