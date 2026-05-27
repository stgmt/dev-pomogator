# Functional Requirements (FR)

## FR-1: Validate format только для receiving doctype

System uses shared validation pipeline для receiving doctype. Across all sub-types validation works единственно для receiving. NOT applicable к остальным documents — только receiving doctype.

For each adapter we use the same validation logic, но конкретно только для receiving variant. Все остальные doctypes используют different pipeline.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

(Note: fixture intentionally combines polymorphic-trigger phrases ("for each adapter", "shared validation pipeline", "across all sub-types") с hard-OUT signals "только" + "единственно" + "конкретно". Detection MUST find triggers, but hard-OUT MUST override → emit HARD_OUT_DETECTED INFO finding (NOT WARNING). Verifies H1 mitigation.)
