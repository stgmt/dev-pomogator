# Design

## Реализуемые требования

- [FR-1: Validate stock](FR.md#fr-1-validate-stock-for-each-adapter-across-all-doctypes)

## Компоненты

- `validateStockForItems` — shared validation pipeline
- `DocumentForm.tsx` — call-site, dispatches per-doctype
