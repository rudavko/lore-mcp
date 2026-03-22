# Task UNR-001: Engine Check Discriminated Union

## Suggestion

Make `engine_check` a discriminated union on `action` with action-specific params and a shared `{ action, ok, data }` envelope; fold `help`, `status`, `history`, `ingest_status`, `build_info`, and `enable_auto_updates` under it.

## Rationale

- FR-008
- FR-010
- FR-019
- NFR-005

## ICE

- Impact: 9, I assume.
- Confidence: 8, I assume.
- Ease: 7, I assume.
- ICE: 504, I assume.
