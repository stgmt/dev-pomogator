---
globs:
  - ".specs/**"
description: Taxonomy of 9 undefined behavior categories for systematic spec audit + BVA boundary values + combined failure scenarios
---

# Undefined Behavior Taxonomy

> Source: extracted from defaulter-skill (Баженов), adapted for Claude native analysis. Python scripts not needed — Claude applies taxonomy directly.

При Phase 3+ Audit спеки — для каждого FR проверь релевантные категории из таблицы ниже. Для каждого непокрытого случая добавь finding как `UNDEFINED_BEHAVIOR` в AUDIT_REPORT.md.

## 9 Categories

### 1. null_empty — Null/Empty Values

| Question Template | Example | Severity |
|---|---|---|
| Что если `{node}` получает null? | SelectWarehouse получает null warehouse ID? | high |
| Что если `{node}` получает пустую строку? | ValidateBarcode получает ""? | high |
| Что если `{node}` получает пустой массив/список? | ProcessItems получает пустой item list? | medium |
| Что если `{node}` возвращает null неожиданно? | GetUserProfile возвращает null? | high |

### 2. network — Network Failures

| Question Template | Example | Severity |
|---|---|---|
| Что если `{node}` таймаутит? | FetchInventory таймаутит после 30 сек? | high |
| Что если `{node}` получает HTTP 404? | GetProduct получает 404 Not Found? | medium |
| Что если `{node}` получает HTTP 500? | SubmitOrder получает 500 Server Error? | critical |
| Что если соединение падает посреди `{node}`? | UploadFile теряет соединение на 50%? | high |
| Что если `{node}` получает невалидный ответ? | ParseApiResponse получает невалидный JSON? | high |

### 3. auth — Authentication/Authorization

| Question Template | Example | Severity |
|---|---|---|
| Что если сессия истекает во время `{node}`? | Сессия истекает во время CheckoutProcess? | high |
| Что если `{node}` вызван без прав? | DeleteUser вызван не-админом? | critical |
| Что если токен отозван во время `{node}`? | OAuth токен отозван посреди sync? | high |
| Что если `{node}` встречает несоответствие ролей? | ViewReport без роли report-viewer? | medium |

### 4. resource — Resource State

| Question Template | Example | Severity |
|---|---|---|
| Что если `{node}` ссылается на удалённый ресурс? | EditProduct ссылается на удалённый product? | high |
| Что если `{node}` использует stale/cached данные? | DisplayInventory показывает устаревший stock? | medium |
| Что если `{node}` встречает залоченный ресурс? | EditDocument находит документ заблокированным? | medium |
| Что если ресурс для `{node}` ещё не создан? | GetOrderDetails вызван до создания order? | high |

### 5. boundary — Boundary Values

| Question Template | Example | Severity |
|---|---|---|
| Что если `{node}` получает минимальное валидное значение? | SetQuantity получает 0? | medium |
| Что если `{node}` получает максимальное валидное значение? | SetQuantity получает MAX_INT? | medium |
| Что если `{node}` получает отрицательное значение? | SetPrice получает -10? | high |
| Что если `{node}` вызывает numeric overflow? | AddToTotal превышает MAX_INT? | critical |
| Что если `{node}` получает значение за границей диапазона? | SetAge получает 151 (max 150)? | medium |

### 6. concurrency — Concurrency Issues

| Question Template | Example | Severity |
|---|---|---|
| Что если два пользователя модифицируют `{node}` одновременно? | Два пользователя редактируют один документ? | high |
| Что если `{node}` вызван дважды быстро? | SubmitOrder двойной клик? | high |
| Что если `{node}` зависит от ресурса, который модифицируется? | CalculateTotal при добавлении items? | medium |
| Что если `{node}` создаёт deadlock? | TransferFunds блокирует оба счёта? | critical |

### 7. logic — Logic/State

| Question Template | Example | Severity |
|---|---|---|
| Что если `{node}` вызван в неправильном состоянии? | ShipOrder вызван до PaymentConfirmed? | high |
| Что если `{node}` нарушает бизнес-правило? | ApplyDiscount превышает макс. скидку? | medium |
| Что если `{node}` создаёт циклическую зависимость? | SetParentCategory создаёт цикл? | high |
| Что если `{node}` получает противоречивые входные данные? | SetDateRange где end < start? | medium |
| Что если предусловия для `{node}` не выполнены? | GenerateReport без required filters? | medium |

### 8. format — Format/Validation

| Question Template | Example | Severity |
|---|---|---|
| Что если `{node}` получает malformed input? | ParseEmail получает "not-an-email"? | medium |
| Что если `{node}` получает неправильный тип данных? | SetAge получает "twenty" вместо 20? | medium |
| Что если `{node}` получает спецсимволы? | SetUsername получает `<script>alert(1)</script>`? | critical |
| Что если `{node}` получает unicode/encoding проблемы? | SaveComment получает emoji или RTL текст? | low |
| Что если input `{node}` превышает max length? | SetDescription получает 10000 символов (max 500)? | medium |

### 9. external — External Dependencies

| Question Template | Example | Severity |
|---|---|---|
| Что если внешний сервис `{node}` недоступен? | SendEmail — SMTP down? | high |
| Что если `{node}` не может получить файл? | LoadConfig не находит config.json? | critical |
| Что если API `{node}` изменил формат? | PaymentGateway вернул новый формат ошибки? | high |
| Что если у `{node}` закончилось место на диске? | SaveAttachment при полном диске? | high |
| Что если `{node}` потерял соединение с БД? | SaveOrder теряет DB connection mid-transaction? | critical |

## BVA Boundary Values (для тестов)

### Числовые

| Тип | Значения для тестирования |
|-----|--------------------------|
| int | 0, -1, 1, 2147483647 (MAX), -2147483648 (MIN), 2147483648 (overflow) |
| uint | 0, 4294967295 (MAX), -1 (below min), 4294967296 (overflow) |
| float | 0.0, -0.0, 0.0001, -0.0001, 3.4e38 (MAX), -3.4e38 (MIN) |
| decimal | 0, 0.0000000001 (precision test) |

### Строки

| Значение | Назначение |
|----------|-----------|
| `""` | Empty string |
| `" "` / `"   "` | Whitespace only |
| `"a"` | Single char |
| `"\n"` / `"\t"` | Control chars |
| `"你好世界"` | Unicode CJK |
| `"😀🎉"` | Emoji |
| `"<script>alert(1)</script>"` | XSS payload |
| `"'; DROP TABLE users; --"` | SQL injection |
| `"\x00"` | Null byte |
| `"a" × 255` | Typical max length |
| `"a" × 10000` | Very long string |

### Массивы

| Значение | Назначение |
|----------|-----------|
| `[]` | Empty array |
| `[item]` | Single element |
| `[null]` | Null element |
| `[item × 10000]` | Very large array |

## 12 Combined Failure Scenarios

Комбинации отказов для проверки "Что если A упал И B упал одновременно?" — проверять для **зависимых** шагов (A вызывает B, или оба работают с одним ресурсом).

| ID | Name | Category | Description |
|----|------|----------|-------------|
| fail_null | Null Return | null_empty | Операция возвращает null |
| fail_empty | Empty Result | null_empty | Операция возвращает пустую коллекцию |
| fail_timeout | Timeout | network | Операция таймаутит |
| fail_404 | Not Found | network | Ресурс возвращает 404 |
| fail_500 | Server Error | network | Сервер возвращает 500 |
| fail_auth | Auth Expired | auth | Токен аутентификации истёк |
| fail_permission | Permission Denied | auth | У пользователя нет прав |
| fail_deleted | Resource Deleted | resource | Ресурс удалён |
| fail_locked | Resource Locked | resource | Ресурс заблокирован другим пользователем |
| fail_stale | Stale Data | resource | Данные устарели/stale |
| fail_concurrent | Concurrent Modification | concurrency | Ресурс модифицирован другим процессом |
| fail_duplicate | Duplicate Operation | concurrency | Операция выполнена дважды |

## How to Use (инструкция для Claude)

При **Phase 3+ Audit** спеки:

1. Прочитай FR.md и USE_CASES.md — извлеки "шаги" workflow (действия системы)
2. Для каждого шага определи релевантные категории из 9 (не все применимы к каждому шагу)
3. Подставь имя шага в question templates
4. Проверь: спека (AC, FR, .feature) отвечает на этот вопрос?
5. Если НЕТ — это finding `UNDEFINED_BEHAVIOR`:
   - node: имя шага
   - category: id категории
   - question: конкретный вопрос
   - severity: из таблицы (critical/high/medium/low)
6. BVA values использовать при написании edge case сценариев в .feature
7. Combined failures проверять для ЗАВИСИМЫХ шагов (не brute-force все пары)
