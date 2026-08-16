## Phase 2 — Per-locale variant tasks (FR-2)

- [ ] T-2-en-US: Implement en-US date+currency formatting in shared pipeline -- @feature2 — Status: TODO | Est: 30m
  _Requirements: [FR-2](FR.md#fr-2-format-dates-and-currency-for-each-locale)_
  _Variant: locale=en-US_
  **Done When:**
  - [ ] `formatLocalized(d, 'en-US', 'date')` returns "MM/DD/YYYY" pattern
  - [ ] `formatLocalized(n, 'en-US', 'currency')` returns "$" PREFIX with comma group + dot decimal
  - [ ] @feature2 Examples row "en-US" passes
  - [ ] No bidi attribute emitted (LTR is default)

- [ ] T-2-en-GB: Implement en-GB date+currency formatting -- @feature2 — Status: TODO | Est: 25m
  _Requirements: [FR-2](FR.md#fr-2-format-dates-and-currency-for-each-locale)_
  _Variant: locale=en-GB_
  **Done When:**
  - [ ] Date format swapped to DMY ("DD/MM/YYYY") — distinct from en-US MDY
  - [ ] Currency symbol "£" PREFIX (not "$")
  - [ ] Regression test: en-US format MUST NOT match en-GB output for ambiguous dates (e.g. 04/05 vs 05/04)
  - [ ] @feature2 Examples row "en-GB" passes

- [ ] T-2-ru-RU: Implement ru-RU date+currency with **suffix** currency placement -- @feature2 — Status: TODO | Est: 40m
  _Requirements: [FR-2](FR.md#fr-2-format-dates-and-currency-for-each-locale)_
  _Variant: locale=ru-RU_
  **Done When:**
  - [ ] Date format DMY with dot separator ("DD.MM.YYYY") — distinct from en-GB slash separator
  - [ ] Currency symbol "₽" SUFFIX after number with NBSP (U+00A0): "1 234,56 ₽" — NOT "₽1,234.56"
  - [ ] Decimal separator is comma; thousands separator is NBSP (per GOST 7.0.97-2016)
  - [ ] @feature2 Examples row "ru-RU" passes
  - [ ] Regression: shared pipeline default Intl.NumberFormat output verified — no fallthrough to en-RU or accidental prefix placement

- [ ] T-2-ja-JP-gregorian: Implement ja-JP default Gregorian date+currency -- @feature2 — Status: TODO | Est: 25m
  _Requirements: [FR-2](FR.md#fr-2-format-dates-and-currency-for-each-locale)_
  _Variant: locale=ja-JP, useImperialEra=false_
  **Done When:**
  - [ ] Date format YMD with kanji separators ("2026年4月30日")
  - [ ] Currency "¥" prefix, NO decimal places (JPY is integer)
  - [ ] Default branch must NOT consult era table when useImperialEra is false
  - [ ] @feature2 Examples row "ja-JP/false" passes

- [ ] T-2-ja-JP-imperial: Implement ja-JP Imperial era opt-in branch + era table -- @feature2 — Status: TODO | Est: 90m
  _Requirements: [FR-2](FR.md#fr-2-format-dates-and-currency-for-each-locale)_
  _Variant: locale=ja-JP, useImperialEra=true_
  **Done When:**
  - [ ] Era table covers minimum 平成 (Heisei, 1989-01-08 to 2019-04-30) and 令和 (Reiwa, 2019-05-01 onwards)
  - [ ] Era boundary lookup: 2019-04-30 → 平成31年, 2019-05-01 → 令和1年
  - [ ] User setting `useImperialEra` read once per render; no global mutation
  - [ ] @feature2 Examples row "ja-JP/true" passes
  - [ ] @feature2 @ja-JP-era-boundary scenario passes (boundary date assertion)
  - [ ] Fallback: if date < 平成 start, fall back to Gregorian rather than throwing

- [ ] T-2-ar-SA: Implement ar-SA RTL date+currency with bidi isolation -- @feature2 — Status: TODO | Est: 120m
  _Requirements: [FR-2](FR.md#fr-2-format-dates-and-currency-for-each-locale)_
  _Variant: locale=ar-SA_
  **Done When:**
  - [ ] Date renders Arabic-Indic digits (٠-٩, U+0660..U+0669) with DMY ordering
  - [ ] Currency symbol "ر.س." (riyal abbreviation) used; placement per CLDR
  - [ ] Render layer emits `dir="rtl"` attribute on container element
  - [ ] Numeric runs wrapped in U+2068 (FSI) ... U+2069 (PDI) so digit groups don't reverse inside RTL paragraph
  - [ ] @feature2 Examples row "ar-SA" passes
  - [ ] @feature2 @ar-SA-bidi-edge scenario passes (mixed-direction paragraph preserves digit order)
  - [ ] Visual regression screenshot reviewed: digits read "30/04/2026" left-to-right inside RTL Arabic sentence (NOT "2026/04/30")

## Coverage Summary

- Variants total: 6 (5 locales, ja-JP split into 2 sub-variants by useImperialEra flag)
- Tasks emitted: 6
- Excluded: 0
- Highest-risk variants: ar-SA (bidi/RTL — render layer change), ja-JP-imperial (era table data dependency)
