{
  "timestamp": {TIMESTAMP},
  "diff_sha256": "{DIFF_SHA256}",
  "session_id": "{SESSION_ID}",
  "variants": [
    {
      "file": "src/services/StockValidationService.ts",
      "kind": "enum-item",
      "name": "stocktaking",
      "lineNumber": 50,
      "reach": "traced",
      "evidence": "grep StartStockTakingModal → not found; dataflow: DocumentForm.handleSave → StockValidationService.isOutboundDocument → qty validation"
    }
  ],
  "should_ship": true
}
