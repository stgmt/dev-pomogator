# Use Cases

## UC-1: Stock validation runs

User submits document form. Validation pipeline invoked. Per-doctype variant determines which formData field is read.

- Form submit
- Pipeline reads warehouseId per variant
- Validation succeeds или blocks
