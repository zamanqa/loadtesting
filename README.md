# Circuly API — Load & Stress Test Suite

k6 performance tests for the **Circuly Unified Customer API (v2026-04)**.  
Covers smoke, load, and stress scenarios across all 10 modules and 44 endpoints.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| [k6](https://k6.io/docs/getting-started/installation/) | ≥ 0.50 | `choco install k6` / `brew install k6` |
| [Node.js](https://nodejs.org/) | ≥ 18 | nodejs.org |
| dotenv-cli | bundled | `npm install` |

---

## Setup

```bash
# 1. Install Node dependencies
npm install

# 2. Copy and fill in credentials
cp .env.example .env
```

### `.env` variables

```ini
BASE_URL=https://circuly-lumen.herokuapp.com   # k6 base URL
API_VERSION=2026-04
CONSUMER_KEY=ck_shopify_po
CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxx
COMPANY_ID=734f-4c766638po
```

---

## Run commands

### Smoke test — connectivity gate (1 VU · 1 iteration · ~2 min)
```bash
npm run all:smoke
```

### Load test — combined all modules (5 VUs · ~1.5 min quick run)
```bash
npm run all:load
```

### Stress test — breaking point finder (0 → 150 VUs · 17 min)
```bash
npm run all:stress
```

### Per-module load tests
**`npm run all:load`**
```bash
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

### Live dashboard
```bash
npm run sync-server    # starts SSE server on http://localhost:3333
```
Open `tests/docs/TEST_CASES.html` in your browser, then run any test — results stream in real time.

---

## Test types

| Type | File | VUs | Duration | Purpose |
|---|---|---|---|---|
| **Smoke** | `tests/smoke/all-modules.smoke.test.js` | 1 | ~2 min | Connectivity & correctness gate |
| **Load** | `tests/load/all-modules.load.test.js` | 5–60 | ~1.5–30 min | Normal traffic baseline |
| **Stress** | `tests/stress/all-modules.stress.test.js` | 0 → 150 | 17 min | Breaking point finder |

### Stress VU ramp profile
```
0 → 50 VUs   (2 min)  — warm-up
   50 VUs    (3 min)  — moderate stress
50 → 100 VUs (2 min)  — high load
  100 VUs    (3 min)  — high stress
100 → 150 VUs (2 min) — peak / breaking point
   150 VUs   (3 min)  — hold peak
     0 VUs   (2 min)  — cool-down
```

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

## Threshold levels

Each test enforces three levels of thresholds via `tests/support/helpers/thresholds.js`:

| Level | Key example | What it gates |
|---|---|---|
| **Global** | `http_req_duration` | Entire test run |
| **Module** | `http_req_duration{module:orders}` | All endpoints in a module |
| **Endpoint** | `http_req_duration{ep:orders.get_list}` | Individual request |

### Threshold values by test type

| Type | p95 | Error rate | Check pass rate |
|---|---|---|---|
| Smoke | 2500 ms (uniform) | < 0.5% | > 99% |
| Load | per-endpoint (measured baselines) | < 5% | > 95% |
| Stress | 2× load baselines | < 10% | > 90% |

---

## Reports

HTML reports are written after every run:

| Test | Report path |
|---|---|
| Smoke | `tests/smoke/reports/all-modules-smoke-report.html` |
| Load (all) | `tests/load/reports/all-modules-load-report.html` |
| Load (module) | `tests/load/reports/<module>-load-report.html` |
| Stress | `tests/stress/reports/all-modules-stress-report.html` |

Open the HTML file in any browser — no server required.

---

## Project structure

```
loadTest-api/
├── .env                              ← credentials (not committed)
├── .env.example                      ← template
├── package.json
└── tests/
    ├── docs/
    │   ├── sync-server.js            ← SSE server for live dashboard
    │   └── TEST_CASES.html           ← live dashboard UI
    ├── fixtures/
    │   └── testData.json
    ├── smoke/
    │   └── all-modules.smoke.test.js       ← 1 VU smoke test
    ├── load/
    │   ├── all-modules.load.test.js        ← combined 44-endpoint load
    │   ├── orders.load.test.js
    │   ├── subscriptions.load.test.js
    │   ├── customers.load.test.js
    │   ├── invoices.load.test.js
    │   ├── transactions.load.test.js
    │   ├── draft-orders.load.test.js
    │   ├── recurring-payments.load.test.js
    │   ├── products.load.test.js
    │   ├── retailers.load.test.js
    │   ├── vouchers.load.test.js
    │   └── login.load.test.js
    ├── stress/
    │   └── all-modules.stress.test.js      ← 0→150 VU stress test
    ├── soak/
    │   └── soak.test.js
    ├── spike/
    │   └── spike.test.js
    ├── support/
    │   ├── helpers/
    │   │   ├── auth.js               ← JWT login + token caching
    │   │   ├── k6.js                 ← k6 imports + BASE_URL + sleep
    │   │   ├── thresholds.js         ← buildThresholds() helper
    │   │   ├── report.js             ← buildHtmlReport() helper
    │   │   ├── apiClient.js          ← circulydbRequest / cssRequest / debtistRequest
    │   │   └── apiHealthCheck.js     ← pre-run health check
    │   ├── commands/                 ← k6 POST/PUT/DELETE helpers per module
    │   ├── queries/                  ← k6 GET helpers per module
    │   └── payloads/                 ← request payload factories per module
    └── _reference/
        ├── README.md                 ← not runnable — Cypress reference only
        └── customer-api/             ← 16 original Cypress spec files (.cy.js)
```

---

## Auth flow

1. `setup()` calls `setupAuth()` → `POST /2026-04/auth/login` with `CONSUMER_KEY` + `CONSUMER_SECRET`
2. JWT token is cached in the k6 shared state
3. Each VU calls `getToken()` → re-uses the cached token (no extra login requests)
4. Token is passed as `Authorization: Bearer <token>` on every request

---

## Adding a new test

1. Copy `tests/load/orders.load.test.js` as a template
2. Define `ENDPOINTS` with `{ tag, p95, p90 }` for each endpoint
3. Import `buildThresholds` — thresholds generate automatically
4. Add a `pre<name>:load` + `<name>:load` pair to `package.json`
5. Add a `REPORT_CONFIG` entry and `handleSummary` pointing to the report path

---

## Contributors

| GitHub | Email |
|---|---|
| [@zamanqa](https://github.com/zamanqa) | zaman@circuly.io |
