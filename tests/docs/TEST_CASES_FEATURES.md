# E2E Test Dashboard — Feature Specification & AI Replication Guide

> **Purpose**: Complete feature specification of `TEST_CASES.html` and its supporting infrastructure for the `unified-customer-api` Cypress E2E project.
> Use this document as an AI prompt/instruction to replicate or extend this dashboard.

---

## Project Context

| Setting            | Value                                             |
|--------------------|---------------------------------------------------|
| Project            | `unified-customer-api`                            |
| API Version        | `2026-04`                                         |
| Base URL           | `https://circuly-lumen.herokuapp.com`             |
| Auth               | JWT Bearer token (`POST /auth/login`)             |
| Total Modules      | 18                                                |
| Total Test Files   | 18                                                |
| Total Tests        | ~90+                                              |
| DB                 | PostgreSQL (via `cy.task('queryDb', sql)`)        |
| Reporter           | `cypress-mochawesome-reporter`                    |

---

## Architecture Overview

- **Single-file SPA**: One self-contained HTML file with inline CSS and JS (no build step, no bundling, no external CSS framework)
- **Backend**: Lightweight Node.js HTTP server (`sync-server.js`) — no frameworks, pure `http` module
- **Data Source**: Hardcoded `TABS` array in the HTML defines all test modules, files, and test cases
- **Report Engine**: Mochawesome reporter parsed from Cypress HTML output
- **PDF Library**: jsPDF (CDN with fallback)
- **Persistence**: Browser `localStorage` for test status tracking
- **Communication**: Server-Sent Events (SSE) for real-time streaming

---

## 1. UI Layout & Design

### Dark Theme
| Token             | Hex       | Usage                          |
|-------------------|-----------|--------------------------------|
| Body BG           | `#1a1b2e` | Page background                |
| Panel/Card BG     | `#222540` | Header, cards, modals          |
| Border            | `#353860` | Dividers, card borders         |
| Primary text      | `#d4d8f0` | Body text                      |
| Accent (purple)   | `#6c7bf0` | Buttons, links, highlights     |
| Success (green)   | `#4ade80` | Pass badges, run buttons       |
| Error (red)       | `#f87171` | Fail badges, stop button       |
| Warning (yellow)  | `#fbbf24` | Blocked badges, running state  |
| Muted text        | `#8890b5` | Secondary text, inactive tabs  |
| Header gradient   | `linear-gradient(135deg, #222540 0%, #1e2040 100%)` | Header bar |

### Font Stack
- Primary: `'Segoe UI', system-ui, -apple-system, sans-serif`
- Monospace (log panel, errors): `'Consolas', 'Fira Code', 'Courier New', monospace`

### Full-Height Flexbox Layout
- `body`: `display: flex; flex-direction: column; min-height: 100vh`
- Header, tab bar, footer: `flex-shrink: 0`
- Main split area: `flex: 1; overflow: hidden`

### Split-Panel Layout
- Left panel: `flex: 1; overflow-y: auto` (test case tabs + accordions)
- Right panel: `width: 50%; min-width: 380px; flex-shrink: 0` (live log output)

### Custom Scrollbars (WebKit)
- Track: `#1a1b2e`, Thumb: `#353860`, Thumb hover: `#4a4f80`, border-radius: 4px

---

## 2. Header Section

### Elements
1. **Title**: `"unified-customer-api — E2E Test Dashboard"` with accent-colored keyword
2. **Server Status Indicator**: Pill badge with glowing dot, polled every 10 seconds via `GET /ping`
3. **Sync Button**: Triggers `GET /sync` to resync test case definitions from disk
4. **Run All Headed Button**: Primary style, runs all specs with visible browser
5. **Run All Headless Button**: Secondary style, runs all specs headlessly
6. **Stop Button**: Danger style, hidden by default, shown during runs

### Stat Boxes (5 boxes, dynamically computed)
| Box          | Source                                      | Style        |
|--------------|---------------------------------------------|--------------|
| Total Tests  | `TABS.reduce(sum of all tests)`             | Default      |
| Test Files   | `TABS.reduce(sum of all files)`             | Default      |
| API Modules  | `TABS.length` (18)                          | Default      |
| Passed       | Real-time from run + localStorage           | Green accent |
| Failed       | Real-time from run + localStorage           | Red accent   |

### Server Health Check
```
Interval: 10 seconds
Endpoint: GET /ping
Timeout:  3 seconds (AbortSignal.timeout)
Online:   green dot with glow + "Server Online"
Offline:  red dot with glow + "Server Offline"
```

---

## 3. Tab Navigation System

### Tab Construction
- One tab per API module from `TABS` array (18 tabs total)
- Each tab shows badge with test count: `tab.files.reduce((s, f) => s + f.tests.length, 0)`
- Extra "Reports" tab appended at the end with `"..."` badge

### Tab Switching
- Active tab: bottom border `2px solid accent`, accent text, accent badge bg
- Inactive: transparent bg, muted text, dark badge
- Reports tab triggers `loadReports()` on activation

---

## 4. TABS Data — All 18 Modules

```javascript
const TABS = [
  {
    id: 'orders', label: 'Orders', num: '01',
    files: [{ name: '01-orders/orders.cy.js', spec: 'cypress/e2e/customer-api/01-orders/orders.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of orders', db: true },
        { title: 'Test 2: Find order by ID from DB and verify via API', db: true },
        { title: 'Test 3: Create a new order with random 12-digit order_id', db: true },
        { title: 'Test 4: Open payment update link for a specific order', db: true },
        { title: 'Test 5: Fetch payment details and verify provider', db: true },
        { title: 'Test 6: Create a note to order and verify success', db: true },
        { title: 'Test 7: Fulfill order using DB order ID', db: true },
        { title: 'Test 8: Cancel order using DB order ID', db: true },
        { title: 'Test 9: Tag order using DB order ID', db: true },
        { title: 'Test 10: Create order then charge it', db: true },
        { title: 'Test 11: Create order then generate invoice for it', db: true },
        { title: 'Test 12: Update order address using DB order ID', db: true },
      ]
    }]
  },
  {
    id: 'customers', label: 'Customers', num: '02',
    files: [{ name: '02-customers/customers.cy.js', spec: 'cypress/e2e/customer-api/02-customers/customers.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of customers', db: false },
        { title: 'Test 2: Get customer by ID from DB', db: true },
        { title: 'Test 3: Update customer details', db: true },
        { title: 'Test 4: Get customer subscriptions', db: true },
        { title: 'Test 5: Get customer orders', db: true },
      ]
    }]
  },
  {
    id: 'invoices', label: 'Invoices', num: '03',
    files: [{ name: '03-invoices/invoices.cy.js', spec: 'cypress/e2e/customer-api/03-invoices/invoices.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of invoices', db: false },
        { title: 'Test 2: Get invoice by ID from DB', db: true },
        { title: 'Test 3: Download invoice PDF', db: true },
        { title: 'Test 4: Send invoice via email', db: true },
      ]
    }]
  },
  {
    id: 'payments', label: 'Payments', num: '04',
    files: [{ name: '04-payments/payments.cy.js', spec: 'cypress/e2e/customer-api/04-payments/payments.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of payments', db: false },
        { title: 'Test 2: Get payment by ID from DB', db: true },
        { title: 'Test 3: Refund a payment', db: true },
      ]
    }]
  },
  {
    id: 'subscriptions', label: 'Subscriptions', num: '05',
    files: [{ name: '05-subscriptions/subscriptions.cy.js', spec: 'cypress/e2e/customer-api/05-subscriptions/subscriptions.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of subscriptions', db: false },
        { title: 'Test 2: Get subscription by ID from DB', db: true },
        { title: 'Test 3: Pause a subscription', db: true },
        { title: 'Test 4: Resume a subscription', db: true },
        { title: 'Test 5: Update subscription address', db: true },
      ]
    }]
  },
  {
    id: 'deliveries', label: 'Deliveries', num: '06',
    files: [{ name: '06-deliveries/deliveries.cy.js', spec: 'cypress/e2e/customer-api/06-deliveries/deliveries.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of deliveries', db: false },
        { title: 'Test 2: Get delivery by ID from DB', db: true },
        { title: 'Test 3: Update delivery status', db: true },
        { title: 'Test 4: Update delivery shipping date', db: true },
      ]
    }]
  },
  {
    id: 'draft-orders', label: 'Draft Orders', num: '07',
    files: [{ name: '07-draft-orders/draft-orders.cy.js', spec: 'cypress/e2e/customer-api/07-draft-orders/draft-orders.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of draft orders', db: false },
        { title: 'Test 2: Get draft order by ID from DB', db: true },
        { title: 'Test 3: Create a new draft order', db: false },
        { title: 'Test 4: Delete a draft order', db: true },
      ]
    }]
  },
  {
    id: 'transactions', label: 'Transactions', num: '08',
    files: [{ name: '08-transactions/transactions.cy.js', spec: 'cypress/e2e/customer-api/08-transactions/transactions.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of transactions', db: false },
        { title: 'Test 2: Get transaction by ID from DB', db: true },
      ]
    }]
  },
  {
    id: 'recurring-payments', label: 'Recurring Payments', num: '09',
    files: [{ name: '09-recurring-payments/recurring-payments.cy.js', spec: 'cypress/e2e/customer-api/09-recurring-payments/recurring-payments.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of recurring payments', db: false },
        { title: 'Test 2: Get recurring payment by ID from DB', db: true },
        { title: 'Test 3: Trigger a recurring payment manually', db: true },
      ]
    }]
  },
  {
    id: 'product-tracking', label: 'Product Tracking', num: '10',
    files: [{ name: '10-product-tracking/product-tracking.cy.js', spec: 'cypress/e2e/customer-api/10-product-tracking/product-tracking.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of tracked products', db: false },
        { title: 'Test 2: Get tracked product by ID from DB', db: true },
      ]
    }]
  },
  {
    id: 'product-variants', label: 'Product Variants', num: '11',
    files: [{ name: '11-product/product-variants.cy.js', spec: 'cypress/e2e/customer-api/11-product/product-variants.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of product variants', db: false },
        { title: 'Test 2: Get product variant by ID from DB', db: true },
        { title: 'Test 3: Update product variant details', db: true },
      ]
    }]
  },
  {
    id: 'retailers', label: 'Retailers', num: '12',
    files: [{ name: '12-retailers/retailers.cy.js', spec: 'cypress/e2e/customer-api/12-retailers/retailers.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of retailers', db: false },
        { title: 'Test 2: Get retailer by ID from DB', db: true },
      ]
    }]
  },
  {
    id: 'vouchers', label: 'Vouchers', num: '13',
    files: [{ name: '13-vouchers/vouchers.cy.js', spec: 'cypress/e2e/customer-api/13-vouchers/vouchers.cy.js',
      tests: [
        { title: 'Test 1: Return a paginated list of vouchers', db: false },
        { title: 'Test 2: Get voucher by ID from DB', db: true },
        { title: 'Test 3: Apply voucher to an order', db: true },
      ]
    }]
  },
  {
    id: 'css', label: 'CSS', num: '14',
    files: [{ name: '14-css/css.cy.js', spec: 'cypress/e2e/customer-api/14-css/css.cy.js',
      tests: [
        { title: 'Test 1: Fetch subscription deliveries and verify billing_date', db: true },
        { title: 'Test 2: Report an issue for a subscription', db: true },
        { title: 'Test 3: Update shipping date for a delivery', db: true },
        { title: 'Test 4: Change subscription frequency', db: true },
        { title: 'Test 5: Perform bundle swap for a subscription', db: true },
        { title: 'Test 6: Cancel a subscription', db: true },
        { title: 'Test 7: Process buyout for a subscription with stripe payment', db: true },
        { title: 'Test 8: Create order by customer', db: true },
      ]
    }]
  },
  {
    id: 'notes', label: 'Notes', num: '15',
    files: [{ name: '15-notes/notes.cy.js', spec: 'cypress/e2e/customer-api/15-notes/notes.cy.js',
      tests: [
        { title: 'Test 1: Return a list of notes for an order', db: true },
        { title: 'Test 2: Create a new note for an order', db: true },
        { title: 'Test 3: Delete a note from an order', db: true },
      ]
    }]
  },
  {
    id: 'debtist', label: 'Debtist', num: '16',
    files: [{ name: '16-debtist/debtist.cy.js', spec: 'cypress/e2e/customer-api/16-debtist/debtist.cy.js',
      tests: [
        { title: 'Test 1: Get debtist cases for company', db: false },
        { title: 'Test 2: Get debtist case by ID', db: true },
        { title: 'Test 3: Update debtist case status', db: true },
      ]
    }]
  },
  {
    id: 'access-keys', label: 'Access Keys', num: '17',
    files: [{ name: '17-access-keys/access-keys.cy.js', spec: 'cypress/e2e/customer-api/17-access-keys/access-keys.cy.js',
      tests: [
        { title: 'Test 1: Return all access keys', db: false },
        { title: 'Test 2: Create a new access key', db: false },
        { title: 'Test 3: Assign access key to a user', db: false },
        { title: 'Test 4: Delete an access key', db: false },
      ]
    }]
  },
  {
    id: 'csv', label: 'CSV', num: '18',
    files: [{ name: '18-csv/csv.cy.js', spec: 'cypress/e2e/customer-api/18-csv/csv.cy.js',
      tests: [
        { title: 'Test 1: Export customers as CSV', db: false },
        { title: 'Test 2: Trigger a data export', db: false },
        { title: 'Test 3: Download an export by ID', db: false },
      ]
    }]
  },
];
```

---

## 5. Test Case Display

### Accordion File Groups
- Each test file = one collapsible accordion (starts open)
- Toggle: `element.classList.toggle('open')`
- Chevron: `&#9654;` right-pointing triangle, rotates 90deg when open via CSS `transform`

### Accordion Header Content
- Chevron icon
- File name (e.g., `01-orders/orders.cy.js`)
- Counters: `"X/Y passed"` + optional `"Z failed"`
- Two run buttons: **Headed** (green) + **Headless** (purple), both use `event.stopPropagation()`

### Test Row Table
| Column      | Width  | Content                                 |
|-------------|--------|-----------------------------------------|
| `#`         | 40px   | Row number (1-based)                    |
| Test Case   | flex   | Test title from TABS                    |
| DB Verified | 90px   | "Yes" (green badge) / "No" (gray badge) |
| Status      | 100px  | Clickable status badge                  |

### Status Badge — Click-to-Cycle
```
Cycle order: Not Run -> Pass -> Fail -> Blocked -> Skip -> Not Run
Storage: localStorage key "status:{tabId}-f{fileIndex}-t{testIndex}"
```
| Status  | BG        | Text      |
|---------|-----------|-----------|
| Not Run | `#2d3050` | `#8890b5` |
| Pass    | `#1a3a2a` | `#4ade80` |
| Fail    | `#3a1a1a` | `#f87171` |
| Blocked | `#3a2f1a` | `#fbbf24` |
| Skip    | `#2d3050` | `#6c7bf0` |

---

## 6. Test Execution (Run System)

### Run Modes
- **Headed**: `npx cypress run --browser chrome --headed --spec <path>`
- **Headless**: `npx cypress run --browser chrome --spec <path>`

### EventSource SSE Protocol
```
URL: /run?spec=<path>&mode=headed|headless
Content-Type: text/event-stream
Frame format: data: {JSON}\n\n

Events:
  { status: 'starting', spec, mode }
  { status: 'file-start', file }
  { status: 'spec-done', file, total, pass, fail }
  { status: 'log', text }
  { status: 'done', ok, exitCode, report }
  { status: 'error', message }
```

### Stop Mechanism
- Client closes `EventSource` connection
- Server `req.on('close')` kills Cypress child process (`child.kill()`)

---

## 7. Live Log Panel

### Structure
1. **Header bar**: "Live Log" title + Clear button
2. **Progress bar**: 6px height, gradient `linear-gradient(90deg, #6c7bf0, #4ade80)`
3. **Error summary**: Red-themed box listing failed tests (monospace)
4. **Log body**: Monospace scrollable area, auto-scrolls on append

### Log Color Classes
| Class      | Color     | Usage               |
|------------|-----------|---------------------|
| `log-pass` | `#4ade80` | Pass messages       |
| `log-fail` | `#f87171` | Fail messages       |
| `log-info` | `#6c7bf0` | File start messages |
| `log-warn` | `#fbbf24` | Warnings            |
| `log-bold` | `#d4d8f0` | Bold emphasis       |

---

## 8. Reports System

### Report Storage
- Directory: `cypress/docs/run-history/`
- Filename: `YYYY-MM-DDTHH-MM-SS_<safe-spec-name>.json`
- Auto-pruning: keeps only latest 10 reports

### Report JSON Schema
```json
{
  "label": "filename.cy.js",
  "spec": "cypress/e2e/customer-api/01-orders/orders.cy.js",
  "time": "4/20/2026, 10:30:00 AM",
  "ok": true,
  "passes": 12,
  "failures": 0,
  "total": 12,
  "duration": 45000,
  "detail": {
    "passes": [{ "title": "Test title", "file": "path/to/spec.cy.js", "duration": 1500 }],
    "failures": [{ "title": "Test title", "file": "path", "duration": 800, "err": { "message": "...", "stack": "..." } }],
    "stats": {},
    "specTotal": 12,
    "specPasses": 12,
    "specFailures": 0
  }
}
```

### Report Card Actions
1. **Refresh** — re-fetches report list
2. **Download PDF** — downloads selected or all reports as PDF (jsPDF 2.5.2)
3. **Delete Selected** — `POST /reports/delete` with file list

---

## 9. Server (sync-server.js)

### Configuration
```javascript
PORT: 7357
HOST: 127.0.0.1
ROOT: path.join(__dirname, '..', '..')  // unified-customer-api root
```

### Endpoints
| Method | Path              | Description                               |
|--------|-------------------|-------------------------------------------|
| GET    | `/ping`           | Health check → `{ ok: true }`            |
| GET    | `/sync`           | Runs sync-test-cases.js                   |
| GET    | `/run`            | SSE stream — runs Cypress, streams output |
| GET    | `/reports`        | Lists all run-history JSONs               |
| GET    | `/reports/get`    | Returns full JSON of a specific report    |
| POST   | `/reports/delete` | Deletes specified report files            |

### Port Conflict Auto-Resolution (Windows)
```javascript
// On EADDRINUSE:
powershell -Command "Get-NetTCPConnection -LocalPort 7357 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
// Retry after 500ms
```

---

## 10. Status Tracking & Persistence

### localStorage Schema
```
Key:   "status:{tabId}-f{fileIndex}-t{testIndex}"
Value: "notrun" | "pass" | "fail" | "blocked" | "skip"
```

### Update Sources
1. **Manual**: Click badge to cycle status → writes to localStorage
2. **Automated**: `applyReportToRows()` after run completes → writes to localStorage

### Reset on New Run
`resetStats()` removes all localStorage status keys, resets all badges to "NOT RUN", zeros counters.

---

## 11. Title Matching (Report → Dashboard)

### Problem
Mochawesome titles include full describe chain:
`"Customer Self Service (CSS) API Test 4: Change subscription frequency"`

TABS stores just the `it()` title:
`"Test 4: Change subscription frequency"`

### Solution: `extractTestCore(title)`
```javascript
function extractTestCore(title) {
  const m = (title || '').match(/Test\s+\d+:\s*(.*)/i);
  return (m ? m[1] : title).trim().toLowerCase();
}
```

Three-way fuzzy match — any one triggers:
1. Exact: `reportCore === tabCore`
2. Report contains tab: `reportCore.includes(tabCore)`
3. Tab contains report: `tabCore.includes(reportCore)`

---

## 12. Sync System (sync-test-cases.js)

### Purpose
Scans `*.cy.js` files on disk and syncs the HTML test case definitions automatically.

### How It Works
1. Scans all `*.cy.js` files under `cypress/e2e/customer-api/`
2. Extracts `it('...')` titles via regex: `/\bit\s*\(\s*(['"\`])([\s\S]*?)\1\s*,/g`
3. Appends new test rows for any NEW `it()` blocks found
4. Creates full accordion sections for brand-new files
5. Respects `data-sync-locked` attribute (skips locked sections)
6. Idempotent: no file write if no changes

### Triggering
- CLI: `node cypress/docs/sync-test-cases.js`
- Dashboard: Sync button → `GET /sync`

---

## 13. URL & Auth Patterns (unique to this project)

### Three Request Helpers (apiClient.js)
| Helper              | URL Pattern                                          | Used by                                    |
|---------------------|------------------------------------------------------|--------------------------------------------|
| `circulydbRequest`  | `{base}/{version}/{companyId}/circulydb/{resource}`  | orders, customers, invoices, payments, subscriptions, transactions, recurring-payments, product-variants, product-tracking, retailers, vouchers, notes, draft-orders, debtist, access-keys, csv |
| `cssRequest`        | `{base}/{version}/css/api/{resource}`                | css, deliveries                            |
| `debtistRequest`    | `{base}/{version}/{companyId}/debtist/{resource}`    | debtist                                    |

### JWT Token Flow
1. First request → `POST /auth/login` with `consumer_key` + `consumer_secret`
2. Response sets `Cypress.env('jwtToken')`, `Cypress.env('jwtTokenExpiry')`, `Cypress.env('companyId')`
3. Token decoded with `atob()` to read `exp` claim — no external library needed
4. Subsequent requests reuse cached token until expiry
5. On expiry → auto re-login before next request

### DB Query Pattern
```javascript
// All DB functions follow this pattern:
export function getSomethingFromDB() {
  const companyId = getCompanyId(); // reads Cypress.env('companyId')
  return cy.task('queryDb', getSomethingQuery(companyId));
}
```

---

## 14. npm Scripts

```json
{
  "scripts": {
    "sync-server":          "node cypress/docs/sync-server.js",
    "api:orders":           "npx cypress run --spec cypress/e2e/customer-api/01-orders/orders.cy.js",
    "api:customers":        "npx cypress run --spec cypress/e2e/customer-api/02-customers/customers.cy.js",
    "api:invoices":         "npx cypress run --spec cypress/e2e/customer-api/03-invoices/invoices.cy.js",
    "api:payments":         "npx cypress run --spec cypress/e2e/customer-api/04-payments/payments.cy.js",
    "api:subscriptions":    "npx cypress run --spec cypress/e2e/customer-api/05-subscriptions/subscriptions.cy.js",
    "api:deliveries":       "npx cypress run --spec cypress/e2e/customer-api/06-deliveries/deliveries.cy.js",
    "api:draft-orders":     "npx cypress run --spec cypress/e2e/customer-api/07-draft-orders/draft-orders.cy.js",
    "api:transactions":     "npx cypress run --spec cypress/e2e/customer-api/08-transactions/transactions.cy.js",
    "api:recurring":        "npx cypress run --spec cypress/e2e/customer-api/09-recurring-payments/recurring-payments.cy.js",
    "api:product-tracking": "npx cypress run --spec cypress/e2e/customer-api/10-product-tracking/product-tracking.cy.js",
    "api:product-variants": "npx cypress run --spec cypress/e2e/customer-api/11-product/product-variants.cy.js",
    "api:retailers":        "npx cypress run --spec cypress/e2e/customer-api/12-retailers/retailers.cy.js",
    "api:vouchers":         "npx cypress run --spec cypress/e2e/customer-api/13-vouchers/vouchers.cy.js",
    "api:css":              "npx cypress run --spec cypress/e2e/customer-api/14-css/css.cy.js",
    "api:notes":            "npx cypress run --spec cypress/e2e/customer-api/15-notes/notes.cy.js",
    "api:debtist":          "npx cypress run --spec cypress/e2e/customer-api/16-debtist/debtist.cy.js",
    "api:access-keys":      "npx cypress run --spec cypress/e2e/customer-api/17-access-keys/access-keys.cy.js",
    "api:csv":              "npx cypress run --spec cypress/e2e/customer-api/18-csv/csv.cy.js"
  }
}
```

---

## 15. How to Replicate for Another Project

### Step 1: Copy Files
Copy these 3 files to your project's `cypress/docs/` folder:
- `TEST_CASES.html` — the dashboard
- `sync-server.js` — the backend server
- `sync-test-cases.js` — the sync utility

### Step 2: Update TABS Array
Replace the `TABS` array in `TEST_CASES.html` with your project's modules (see Section 4 above).

### Step 3: Update Server Paths
In `sync-server.js`, update:
- `ROOT` — path to your project root
- `REPORT_HTML` — path to your mochawesome HTML report
- `SYNC_SCRIPT` — path to your sync script

### Step 4: Update Branding
In `TEST_CASES.html`: change `<title>` and `<h1>` text.

### Step 5: Add npm Script
```json
{ "scripts": { "sync-server": "node cypress/docs/sync-server.js" } }
```

### Step 6: Ensure Mochawesome Reporter
```javascript
// cypress.config.js
reporter: 'cypress-mochawesome-reporter',
reporterOptions: { reportDir: 'cypress/reports/html', overwrite: true, html: true, json: false }
```

---

## Dependencies

| Dependency                     | Type     | Purpose                     |
|--------------------------------|----------|-----------------------------|
| Node.js                        | Runtime  | Server execution            |
| Cypress 13                     | Dev dep  | Test runner                 |
| cypress-mochawesome-reporter   | Dev dep  | HTML report generation      |
| jsPDF 2.5.2                    | CDN      | PDF export                  |
| Browser localStorage           | Built-in | Status persistence          |

No additional npm packages required for the dashboard itself.
