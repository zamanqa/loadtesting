# loadTest-api — Project Memory

## What this project is
k6 performance test suite for the Circuly Unified Customers API (version `2026-04`).
Covers smoke, load, and stress scenarios across 10 modules and 44 endpoints.
Cypress specs are retained in `tests/_reference/` for reference only and are not executed.

---

## API connection

| Setting | Value |
|---|---|
| Base URL | see `.env` → `BASE_URL` |
| API version | `2026-04` (default) — see `.env` → `API_VERSION` |
| Auth | JWT Bearer — `POST /{API_VERSION}/auth/login` with `consumer_key` + `consumer_secret` |
| Consumer Key | see `.env` → `CONSUMER_KEY` |
| Consumer Secret | see `.env` → `CONSUMER_SECRET` |
| Company ID | see `.env` → `COMPANY_ID` |

Token is cached per VU in `auth.js` — re-login only when JWT `exp` is within 5 minutes.

---

## URL patterns (3 variants)

| Module type | URL format | Helper |
|---|---|---|
| Most endpoints | `{BASE_URL}/{API_VERSION}/{companyId}/circulydb/{resource}` | `circulydbRequest` |
| CSS / Deliveries | `{BASE_URL}/{API_VERSION}/css/{resource}` | `cssRequest` |
| Debt collection | `{BASE_URL}/{API_VERSION}/{companyId}/debtist/{resource}` | `debtistRequest` |

All helpers live in `tests/support/helpers/apiClient.js`.

---

## Run commands

```bash
npm run all:smoke               # smoke test — 1 VU, 1 iteration
npm run all:load                # combined load test — all 44 endpoints
npm run all:stress              # stress test — 0 → 150 VUs over 17 min
npm run sync-server             # live dashboard SSE server on http://localhost:3333

# Per-module load tests
npm run login:load
npm run orders:load
npm run subscriptions:load
npm run customers:load
npm run invoices:load
npm run transactions:load
npm run draft-orders:load
npm run recurring-payments:load
npm run products:load
npm run retailers:load
npm run vouchers:load
```

---

## Project structure

```
loadTest-api/
├── .env                              ← credentials (gitignored)
├── .env.example                      ← variable names template
├── package.json
└── tests/
    ├── docs/
    │   ├── sync-server.js            ← SSE server for live dashboard
    │   ├── sync-test-cases.js        ← test case sync utility
    │   ├── TEST_CASES.html           ← live dashboard UI
    │   └── TEST_CASES_FEATURES.md
    ├── fixtures/
    │   └── testData.json
    ├── smoke/
    │   ├── all-modules.smoke.test.js ← 1 VU smoke test (44 endpoints)
    │   └── smoke.test.js
    ├── load/
    │   ├── all-modules.load.test.js  ← combined 44-endpoint load test
    │   ├── login.load.test.js
    │   ├── orders.load.test.js
    │   ├── subscriptions.load.test.js
    │   ├── customers.load.test.js
    │   ├── invoices.load.test.js
    │   ├── transactions.load.test.js
    │   ├── draft-orders.load.test.js
    │   ├── recurring-payments.load.test.js
    │   ├── products.load.test.js
    │   ├── retailers.load.test.js
    │   └── vouchers.load.test.js
    ├── stress/
    │   ├── all-modules.stress.test.js ← 0→150 VU stress test
    │   └── stress.test.js
    ├── soak/
    │   └── soak.test.js
    ├── spike/
    │   └── spike.test.js
    ├── support/
    │   ├── helpers/
    │   │   ├── auth.js               ← JWT login + per-VU token caching
    │   │   ├── k6.js                 ← k6 built-ins + env var exports
    │   │   ├── apiClient.js          ← circulydbRequest / cssRequest / debtistRequest
    │   │   ├── thresholds.js         ← buildThresholds() helper
    │   │   ├── report.js             ← buildHtmlReport() helper
    │   │   └── apiHealthCheck.js     ← pre-run server wake-up check
    │   ├── commands/                 ← k6 POST/PUT/DELETE helpers (one file per module)
    │   ├── queries/                  ← k6 GET helpers (one file per module)
    │   └── payloads/                 ← request payload factories (one file per module)
    └── _reference/
        ├── README.md                 ← not runnable — Cypress reference only
        ├── customer-api/             ← 16 original Cypress spec files (.cy.js)
        └── support/customer-api/     ← original Cypress support files
```

---

## Key architectural decisions

### JWT token caching
`getToken()` in `auth.js` keeps token + expiry in module-level variables per VU.
Token is reused across iterations; re-login only fires when within 5 minutes of JWT `exp`.
`atob()` decodes the JWT payload — no external library needed (built into k6).

### setup() — ID fetching
`all-modules.load.test.js` uses a `setup()` function that runs once before VUs start.
It calls `fetchFirst()` for each module — a live `GET ?page=1&per_page=1` API call — to
resolve real IDs (orderId, subscriptionId, transactionId, etc.) that VUs use in tests.
No hardcoded IDs, no DB queries — always uses current data from the API.

### Three URL patterns
- `circulydbRequest` — most modules: includes `companyId` + `/circulydb/` segment
- `cssRequest` — CSS/Deliveries: no `companyId`, uses `/css/` segment
- `debtistRequest` — Debt collection: includes `companyId`, no `/circulydb/` segment

### Threshold structure
Three levels enforced via `buildThresholds()`:
- **Global** — `http_req_duration` across the entire run
- **Module** — `http_req_duration{module:orders}` across all endpoints in a module
- **Endpoint** — `http_req_duration{ep:orders.get_list}` per individual request

### HTML reports
Each test writes a self-contained HTML report via `buildHtmlReport()` in `report.js`.
Reports are written to `tests/{type}/reports/` and gitignored.

---

## Modules & endpoints (44 total)

| Module | Endpoints |
|---|---|
| Orders | list · by_id · payment_update_link · payment_methods · filter · search |
| Subscriptions | list · by_id · filter · search |
| Customers | list · by_id · balance · filter · search |
| Invoices | list · by_number · filter · search |
| Transactions | list · by_id · filter · search |
| Draft Orders | list · by_id · filter · search |
| Recurring Payments | list · by_id · filter · search |
| Products | list · variants · all_variants · filter · search |
| Retailers | list · by_location_id · filter · search |
| Vouchers | list · by_code · filter · search |

---

## Contributors

| GitHub | Email |
|---|---|
| [@zamanqa](https://github.com/zamanqa) | zaman@circuly.io |
