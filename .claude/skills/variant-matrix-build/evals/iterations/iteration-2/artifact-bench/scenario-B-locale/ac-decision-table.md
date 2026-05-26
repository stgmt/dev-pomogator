## AC-2 (FR-2): Format dates and currency for each locale

**Variant Axis:** locale
**Shared codepath:** `formatLocalized(value, locale, type)` (date+currency dispatch via locale tag)

| # | Variant | Trigger condition | Expected param | Test ref (@featureN) | Coverage |
|---|---------|-------------------|----------------|----------------------|----------|
| 1 | en-US | locale tag == "en-US" | date format MDY (e.g. "04/30/2026"), currency symbol "$" prefix (e.g. "$1,234.56"), LTR direction | @feature2-en-US | pending |
| 2 | en-GB | locale tag == "en-GB" | date format DMY (e.g. "30/04/2026"), currency symbol "£" prefix (e.g. "£1,234.56"), LTR direction | @feature2-en-GB | pending |
| 3 | ru-RU | locale tag == "ru-RU" | date format DMY (e.g. "30.04.2026"), currency symbol "₽" SUFFIX with NBSP (e.g. "1 234,56 ₽"), LTR direction | @feature2-ru-RU | pending |
| 4 | ja-JP (Gregorian default) | locale tag == "ja-JP" AND user.useImperialEra == false | date format YMD Gregorian (e.g. "2026年4月30日"), currency "¥" prefix (e.g. "¥1,235"), LTR | @feature2-ja-JP-gregorian | pending |
| 5 | ja-JP (Imperial era opt-in) | locale tag == "ja-JP" AND user.useImperialEra == true | date format Imperial era (e.g. "令和8年4月30日"), currency "¥" prefix, era table lookup MUST resolve to current era from system date | @feature2-ja-JP-imperial | pending |
| 6 | ar-SA | locale tag == "ar-SA" | date format DMY Arabic numerals (e.g. "٣٠‏/٠٤‏/٢٠٢٦"), currency "ر.س." prefix, **RTL direction MUST be applied via `dir="rtl"` attribute + bidi isolation (U+2068 FSI / U+2069 PDI) around numeric runs** | @feature2-ar-SA | pending |

**Notes:**
- Row 4 vs 5: same locale tag, different variant axis value via per-user setting flag — both required because Imperial era is documented as opt-in (default Gregorian).
- Row 6 RTL handling is the primary regression risk: forgetting bidi isolation causes mixed-direction numeric runs (date "30/04/2026" inside Arabic paragraph) to render with reversed digit groups.
- Row 3 currency placement (suffix, not prefix) is the ru-RU specific quirk that breaks if shared pipeline assumes Intl.NumberFormat default — must verify against `style: 'currency', currencyDisplay: 'symbol'` actual output, not assumption.
