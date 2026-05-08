# Reference: Cypress E2E Specs

These files are the original Cypress E2E test suite for the Circuly Unified Customer API (v2026-04).

**They are NOT runnable from this project** — Cypress has been removed as a dependency.
They are kept here as reference material for test logic, API coverage, and payload examples.

## What's here

| Folder | Contents |
|---|---|
| `customer-api/` | 18 Cypress spec files (01-orders → 18-csv) |
| `support/customer-api/` | Original Commands, Queries, and Payloads files |
| `support/customer-api/_shared/apiClient.js` | Original Cypress JWT auth client |

## Active tests

The runnable k6 tests live in:

```
tests/load/     ← load tests (per-module + all-modules)
tests/smoke/    ← smoke test (1 VU)
tests/stress/   ← stress test (0→150 VU ramp)
tests/soak/     ← soak test
tests/spike/    ← spike test
```

## Migrated k6 helpers

The Cypress support files have been migrated to k6-compatible modules:

```
tests/support/helpers/apiClient.js    ← k6 circulydbRequest / cssRequest / debtistRequest
tests/support/payloads/               ← pure JS payload factories (one file per module)
tests/support/commands/               ← k6 POST/PUT/DELETE helpers
tests/support/queries/                ← k6 GET helpers
```
