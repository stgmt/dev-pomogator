Feature: PFRC001_Polymorphic_FR_complete_with_examples

  Background:
    Given test fixture initialized

  @feature1
  Scenario Outline: PFRC002_Stock_validation_per_doctype
    Given doctype is "<doctype>"
    And source field is "<source-field>"
    When validation pipeline runs
    Then warehouseId equals "<expected-warehouse-id>"

    Examples:
      | doctype     | source-field              | expected-warehouse-id     |
      | IN          | formData.warehouseId      | formData.warehouseId      |
      | OUT         | formData.warehouseId      | formData.warehouseId      |
      | WH_TRANSFER | formData.sourceWarehouseId| formData.sourceWarehouseId|
      | REVAL       | formData.warehouseId      | formData.warehouseId      |
      # STOCKTAKING excluded — see ACCEPTANCE_CRITERIA.md AC-1 row 5
