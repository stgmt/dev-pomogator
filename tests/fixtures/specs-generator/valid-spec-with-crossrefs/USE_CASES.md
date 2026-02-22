# Use Cases

## UC-1: Import CSV Data @feature1

**Actor:** Warehouse Operator

**Preconditions:**
- CSV file is prepared
- System is running

**Main Flow:**
1. User uploads CSV file
2. System validates format
3. System imports data
4. System shows result

**Postconditions:**
- Data saved to database

**Related:** [FR-1](FR.md#fr-1-data-import), [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-success-import)

## UC-2: Export Report @feature2

**Actor:** Manager

**Preconditions:**
- Report data exists

**Main Flow:**
1. User selects report
2. User clicks export
3. System generates PDF
4. System saves file

**Postconditions:**
- PDF file created

**Related:** [FR-2](FR.md#fr-2-data-export), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-export-pdf)
