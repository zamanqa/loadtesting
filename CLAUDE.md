# loadTest-api — Project Memory

## What this project is
k6 performance test suite for the Circuly Unified Customers API (version `2026-04`).
Covers smoke, load, and stress scenarios across 10 modules and 44 endpoints.
Cypress specs are retained in `tests/_reference/` for reference only and are not executed.

---

## API connection

| Setting | Value |
|---|---|
| Base URL | `https://circuly-lumen.herokuapp.com` |
| API version | `2026-04` |
| Auth | JWT Bearer — `POST /auth/login` with consumer_key + consumer_secret |
| Consumer Key | see `.env` |
| Consumer Secret | see `.env` |

Login response sets `Cypress.env('jwtToken')`, `Cypress.env('jwtTokenExpiry')`, `Cypress.env('companyId')`.
Token is cached — re-login only happens when JWT `exp` is past.

---

## URL patterns (3 variants)

| Module type | URL format | Helper |
|---|---|---|
| Most endpoints | `{base}/{version}/{companyId}/circulydb/{resource}` | `circulydbRequest` |
| CSS / Deliveries | `{base}/{version}/{companyId}/css/{resource}` | `cssRequest` |
| Debt collection | `{base}/{version}/{companyId}/debtist/{resource}` | `debtistRequest` |

All helpers live in `cypress/support/customer-api/_shared/apiClient.js`.

---

## DB connection (PostgreSQL)

Configured in `cypress.config.js` via `cy.task('queryDb', sqlString)`.
`COMPANY_ID` is pre-seeded from `.env` so DB queries work before first login.

| Env var | Value |
|---|---|
| DB_HOST | see `.env` |
| DB_NAME | see `.env` |
| DB_PORT | see `.env` |
| DB_USER | see `.env` |
| COMPANY_ID | see `.env` |

---

## Project structure

```
unified-customer-api/
├── .env                         ← credentials (not committed)
├── .env.example
├── cypress.config.js
├── package.json
└── cypress/
    ├── e2e/customer-api/
    │   ├── 01-orders/orders.cy.js
    │   ├── 02-customers/customers.cy.js
    │   ├── 03-invoices/invoices.cy.js
    │   ├── 04-payments/payments.cy.js
    │   ├── 05-subscriptions/subscriptions.cy.js
    │   ├── 06-deliveries/deliveries.cy.js
    │   ├── 07-draft-orders/draft-orders.cy.js
    │   ├── 08-transactions/transactions.cy.js
    │   ├── 09-recurring-payments/recurring-payments.cy.js
    │   ├── 10-product-tracking/product-tracking.cy.js
    │   ├── 11-product/product-variants.cy.js
    │   ├── 12-retailers/retailers.cy.js
    │   ├── 13-vouchers/vouchers.cy.js
    │   ├── 14-css/css.cy.js
    │   ├── 15-notes/notes.cy.js
    │   ├── 16-debtist/debtist.cy.js
    │   ├── 17-access-keys/access-keys.cy.js
    │   └── 18-csv/csv.cy.js
    └── support/customer-api/
        ├── _shared/apiClient.js           ← JWT auth + 3 request helpers
        ├── orders/{Commands,Queries,Payloads}.js
        ├── customers/{Commands,Queries,Payloads}.js
        ├── invoices/{Commands,Queries,Payloads}.js
        ├── payments/{Commands,Queries,Payloads}.js
        ├── subscriptions/{Commands,Queries,Payloads}.js
        ├── deliveries/{Commands,Queries}.js
        ├── draft-orders/{Commands,Queries,Payloads}.js
        ├── transactions/{Commands,Queries}.js
        ├── recurring-payments/{Commands,Queries}.js
        ├── product-tracking/{Commands,Queries}.js
        ├── product-variants/{Commands,Queries}.js
        ├── retailers/{Commands,Queries}.js
        ├── vouchers/voucherCommands.js
        ├── css/{Commands,Queries}.js
        ├── notes/{Commands,Queries}.js
        ├── debtist/{Commands,Queries}.js
        ├── access-keys/accessKeyCommands.js
        └── csv/csvCommands.js
```

---

## Key architectural decisions

### JWT token caching
`ensureAuthenticated()` in `apiClient.js` decodes the JWT `exp` claim using `atob()` (no external lib).
Token is stored in `Cypress.env('jwtToken')` + `Cypress.env('jwtTokenExpiry')` — survives across tests within a run.

### companyId flow
1. Pre-seeded from `.env` → `COMPANY_ID` → `cypress.config.js` → `Cypress.env('companyId')`
2. Overwritten at runtime with value from login response
3. DB queries use `getCompanyId()` which reads `Cypress.env('companyId')` — works before first login because of pre-seed

### Deliveries (CSS module)
CSS endpoints follow pattern: `{base}/{version}/css/{resource}` — no `companyId`, no `circulydb`.
`deliveriesCommands.js` uses `cssRequest` with `/css/deliveries` as endpoint.

### Access keys endpoints
Use `circulydbRequest` — map to `/keys`, `/assign`, `/keys/{id}`.
Old Postman had `{{customers_lumen_url}}/{{company_id}}/keys` → now `/circulydb/keys`.

### CSV/export endpoints
Use `circulydbRequest` — map to `/CSV` (POST with `type` body), `/export`, `/exports/{id}`.

---

## Run commands

```bash
npm run api:orders          # 01-orders only
npm run api:customers       # 02-customers only
# ... (api:invoices, api:payments, api:subscriptions, etc.)
npx cypress run             # all specs
npx cypress open            # interactive
```

---

## Source reference
- Old project (Basic Auth, 16 modules): `C:\Users\shahi\Circuly Project\customer-api-e2e`
- Postman collection: `C:\Users\shahi\Downloads\circuly_customers API (2026-04) (hub).postman_collection.json`

---

## SQA Skill — Active Rules

> Skill file: `.claude/skills/SQA_E2E_Automation_Pro.json` (v2.0)
> These rules apply to ALL responses in this project.

### Code Style
| Rule | Standard |
|---|---|
| Complexity | Intermediate |
| Hooks | Always include `beforeEach` / `afterEach` |
| Assertions | Meaningful assertions after every action |
| Selectors | Prefer `data-testid` → `aria-label` → avoid CSS class |
| Error handling | Wrap critical steps in `try/catch` where applicable |
| Comments | `// selector: …` and `// action: …` on every UI element |

### Token Efficiency
- Summaries and tables **first**, detailed sections second
- Group repetitive steps into loops / functions / tables
- Short, precise inline comments — no long explanations in code
- Always structured and immediately actionable

### Test Cases Format
Columns: `TC-ID | Test Type | Action | Input | Expected Output | Priority (P1/P2/P3) | Tag (Smoke/Sanity/Regression) | Notes`
Always include: normal, edge, boundary, negative scenarios. Flag high-risk and automation candidates.

### Available Skill Prompts
| ID | Purpose |
|---|---|
| `test_cases` | Generate tabular E2E test cases |
| `automation_cypress` | Cypress JS automation code |
| `automation_playwright` | Playwright + POM TypeScript |
| `automation_api` | REST API test code (cy.request / APIRequestContext) |
| `log_analysis` | Analyze Cypress/Playwright logs |
| `bug_report` | Linear-ready structured bug report |
| `test_data` | JSON payloads + SQL seed data |
| `regression_priority` | Smoke / Sanity / Full Regression categorization |
| `cicd_github_actions` | GitHub Actions YAML with Mochawesome + Slack |
| `sql_validation` | Pre/post condition SQL queries |
| `mochawesome_config` | Reporter setup + merge config |
| `sprint_summary` | Sprint-end QA summary report |
| `coverage_gap` | Test coverage gap analysis |
| `bdd_gherkin` | Gherkin `.feature` file from test cases |
| `performance_k6` | k6 load test scaffold |

### n8n Automation Suggestions
Always flag relevant n8n flows at the end of responses:
- **Test Failure → Linear Bug** — auto-create ticket on test failure
- **Daily Regression Summary** — cron → GitHub Actions results → Slack
- **Linear Story → Draft Test Cases** — 'Ready for QA' label → Claude → Linear comment
- **PR Opened → Smoke Tests** — GitHub PR → trigger workflow → PR comment
- **Mochawesome → Slack** — parse JSON → post summary to QA channel
- **Sprint End → Test Summary** — Linear issues + stats → Claude → Confluence
- **Flaky Test Detector** — retry pattern detection → Linear 'flaky-test' ticket
