{
  "timestamp": {TIMESTAMP},
  "diff_sha256": "old1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd",
  "session_id": "{SESSION_ID}",
  "variants": [
    {
      "file": "src/services/StockValidationService.ts",
      "kind": "enum-item",
      "name": "stocktaking",
      "lineNumber": 50,
      "reach": "traced",
      "evidence": "stale — diff hash mismatch test fixture"
    }
  ],
  "should_ship": true
}
