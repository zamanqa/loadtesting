/**
 * Shared report utilities for k6 load tests.
 *
 * Usage in any test file:
 *
 *   import { buildHtmlReport } from '../../support/helpers/report.js';
 *
 *   export function handleSummary(data) {
 *     return {
 *       'cypress/e2e/load/reports/my-report.html': buildHtmlReport(data, {
 *         title:    'My Load Test Report',
 *         subtitle: '100 VUs · 8 min',
 *         module:   'orders',           // optional — enables the module group summary bar
 *         endpoints: [
 *           { tag: 'orders.get_list', label: 'GET /orders (list)', p95limit: 500 },
 *         ],
 *       }),
 *       stdout: textSummary(data, { indent: '  ', enableColors: true }),
 *     };
 *   }
 */

export function ms(val) {
  return val != null ? `${Math.round(val)} ms` : '—';
}

export function pct(val) {
  return val != null ? `${(val * 100).toFixed(1)}%` : '—';
}

export function rps(val) {
  return val != null ? `${val.toFixed(1)} req/s` : '—';
}

export function getMetric(data, key) {
  return data.metrics[key] ? data.metrics[key].values : null;
}

export function passed(data, key) {
  const t = data.thresholds && data.thresholds[key];
  return t ? t.ok !== false : null;
}

/**
 * Generates a self-contained HTML report with three result levels:
 *   1. Global summary bar    — overall pass/fail, total requests, error rate, p95
 *   2. Module group summary  — aggregate p95/p99/error rate/RPS across all endpoints
 *   3. Per-endpoint cards    — individual metrics including check pass rate and RPS
 *
 * @param {object} data      - The k6 summary data object from handleSummary
 * @param {object} config
 * @param {string} config.title      - Report page title and heading
 * @param {string} config.subtitle   - Shown under the heading (VUs, duration, etc.)
 * @param {string} [config.module]   - Module tag name, e.g. 'orders'. Enables the group summary section.
 * @param {Array}  config.endpoints  - List of { tag, label, p95limit } objects
 */
export function buildHtmlReport(data, { title, subtitle, module: moduleName, endpoints }) {
  const runAt      = new Date().toUTCString();
  const globalDur  = getMetric(data, 'http_req_duration');
  const globalFail = getMetric(data, 'http_req_failed');
  const globalReqs = getMetric(data, 'http_reqs');
  const allPassed  = passed(data, 'http_req_duration') !== false &&
                     passed(data, 'http_req_failed') !== false;

  // Find the slowest endpoint by p95 to highlight it at the top
  let slowestTag = null;
  let slowestP95 = 0;
  endpoints.forEach(({ tag }) => {
    const dur = getMetric(data, `http_req_duration{endpoint:${tag}}`);
    if (dur && dur['p(95)'] > slowestP95) {
      slowestP95 = dur['p(95)'];
      slowestTag = tag;
    }
  });

  // Module group summary — only rendered when `module` is provided in the config
  let moduleSummaryHtml = '';
  if (moduleName) {
    const modDur  = getMetric(data, `http_req_duration{module:${moduleName}}`);
    const modFail = getMetric(data, `http_req_failed{module:${moduleName}}`);
    const modReqs = getMetric(data, `http_reqs{module:${moduleName}}`);
    const modP90  = modDur ? modDur['p(90)'] : null;
    const modP95  = modDur ? modDur['p(95)'] : null;
    const modErr  = modFail ? modFail.rate : null;
    const modRps  = modReqs ? modReqs.rate : null;

    moduleSummaryHtml = `
  <div class="module-summary">
    <div class="module-summary-title">Module group: <code>${moduleName}</code></div>
    <div class="module-summary-stats">
      <span class="mod-stat">
        <span class="mod-label">p90</span>
        <span class="mod-value">${ms(modP90)}</span>
      </span>
      <span class="mod-sep">·</span>
      <span class="mod-stat">
        <span class="mod-label">p95</span>
        <span class="mod-value ${modP95 != null && modP95 < 500 ? 'good' : 'bad'}">${ms(modP95)}</span>
      </span>
      <span class="mod-sep">·</span>
      <span class="mod-stat">
        <span class="mod-label">Error rate</span>
        <span class="mod-value ${modErr != null && modErr > 0.01 ? 'bad' : 'good'}">${pct(modErr)}</span>
      </span>
      <span class="mod-sep">·</span>
      <span class="mod-stat">
        <span class="mod-label">Throughput</span>
        <span class="mod-value">${rps(modRps)}</span>
      </span>
    </div>
  </div>`;
  }

  // Per-endpoint cards
  const cards = endpoints.map(({ tag, label, p95limit }) => {
    const dur      = getMetric(data, `http_req_duration{endpoint:${tag}}`);
    const fail     = getMetric(data, `http_req_failed{endpoint:${tag}}`);
    const reqs     = getMetric(data, `http_reqs{endpoint:${tag}}`);
    const chks     = getMetric(data, `checks{endpoint:${tag}}`);
    const ok       = passed(data, `http_req_duration{endpoint:${tag}}`);
    const p90Val      = dur ? dur['p(90)'] : null;
    const p95Val      = dur ? dur['p(95)'] : null;
    const checkRate   = chks ? chks.rate : null;
    const endpointRps = reqs ? reqs.rate : null;
    const skipped     = !dur;

    const badge = skipped
      ? `<span class="badge skip">SKIPPED</span>`
      : ok === false
        ? `<span class="badge fail">❌ FAIL</span>`
        : `<span class="badge pass">✅ PASS</span>`;

    const p90limit   = Math.round(p95limit * 0.80);
    const p90Class   = p90Val != null ? (p90Val < p90limit ? 'good' : 'bad') : '';
    const p95Class   = p95Val != null ? (p95Val < p95limit ? 'good' : 'bad') : '';
    const checkClass = checkRate != null ? (checkRate >= 0.95 ? 'good' : 'bad') : '';

    return `
    <div class="card ${skipped ? 'skipped' : ok === false ? 'failed' : 'passed'}">
      <div class="card-header">
        <span class="endpoint-label">${label}</span>
        ${badge}
      </div>
      <div class="card-meta">
        Tag: <code>${tag}</code> &nbsp;·&nbsp; p90 limit: <code>${p90limit} ms</code> &nbsp;·&nbsp; p95 limit: <code>${p95limit} ms</code>
      </div>
      ${skipped
        ? `<p class="skip-note">Not called — required data was unavailable.</p>`
        : `<table class="metrics-table">
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>Total requests</td><td>${reqs ? Math.round(reqs.count || 0).toLocaleString() : '—'}</td></tr>
          <tr><td>Throughput</td><td>${rps(endpointRps)}</td></tr>
          <tr><td>Error rate</td><td class="${fail && fail.rate > 0.01 ? 'bad' : 'good'}">${pct(fail ? fail.rate : null)}</td></tr>
          <tr><td>Check pass rate</td><td class="${checkClass}">${pct(checkRate)}</td></tr>
          <tr><td>avg</td><td>${ms(dur ? dur.avg : null)}</td></tr>
          <tr><td>min</td><td>${ms(dur ? dur.min : null)}</td></tr>
          <tr><td class="${p90Class}">p90</td><td class="${p90Class}">${ms(p90Val)}</td></tr>
          <tr><td class="${p95Class}">p95</td><td class="${p95Class}">${ms(p95Val)}</td></tr>
          <tr><td>max</td><td>${ms(dur ? dur.max : null)}</td></tr>
        </table>`}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f5f7fa; color: #333; }
    .header { background: #1a2340; color: #fff; padding: 28px 40px; }
    .header h1 { margin: 0 0 6px; font-size: 1.6rem; }
    .header p { margin: 0; opacity: 0.7; font-size: 0.9rem; }
    .summary { display: flex; gap: 16px; flex-wrap: wrap; padding: 24px 40px; background: #fff; border-bottom: 1px solid #e0e4eb; }
    .stat { flex: 1; min-width: 130px; background: #f5f7fa; border-radius: 8px; padding: 16px 20px; text-align: center; }
    .stat .label { font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .stat .value { font-size: 1.4rem; font-weight: 700; }
    .result-badge { font-size: 1rem; font-weight: 700; padding: 6px 18px; border-radius: 6px; display: inline-block; }
    .result-pass { background: #d4edda; color: #155724; }
    .result-fail { background: #f8d7da; color: #721c24; }
    .module-summary { margin: 20px 40px 0; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 14px 20px; }
    .module-summary-title { font-size: 0.78rem; color: #4338ca; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .module-summary-title code { background: #c7d2fe; padding: 1px 6px; border-radius: 3px; font-size: 0.76rem; }
    .module-summary-stats { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .mod-stat { display: flex; flex-direction: column; align-items: center; min-width: 80px; background: #fff; border-radius: 6px; padding: 8px 14px; }
    .mod-label { font-size: 0.68rem; color: #888; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
    .mod-value { font-size: 1rem; font-weight: 700; }
    .mod-sep { color: #a5b4fc; font-size: 1.2rem; }
    .slowest { margin: 16px 40px 0; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px 20px; font-size: 0.88rem; color: #856404; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 20px; padding: 24px 40px; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden; border-top: 4px solid #adb5bd; }
    .card.passed { border-top-color: #28a745; }
    .card.failed { border-top-color: #dc3545; }
    .card.skipped { border-top-color: #adb5bd; opacity: 0.65; }
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px 6px; }
    .endpoint-label { font-weight: 600; font-size: 0.92rem; }
    .card-meta { padding: 0 20px 10px; font-size: 0.76rem; color: #777; }
    .card-meta code { background: #f0f2f5; padding: 1px 5px; border-radius: 3px; }
    .skip-note { padding: 10px 20px 16px; color: #999; font-size: 0.85rem; }
    .metrics-table { width: 100%; border-collapse: collapse; }
    .metrics-table th, .metrics-table td { padding: 7px 20px; font-size: 0.85rem; border-top: 1px solid #f0f2f5; text-align: left; }
    .metrics-table th { background: #f8f9fa; font-weight: 600; color: #555; }
    .badge { font-size: 0.76rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; }
    .badge.pass { background: #d4edda; color: #155724; }
    .badge.fail { background: #f8d7da; color: #721c24; }
    .badge.skip { background: #e2e3e5; color: #6c757d; }
    .good { color: #155724; font-weight: 600; }
    .bad  { color: #721c24; font-weight: 600; }
    .footer { text-align: center; padding: 24px; color: #aaa; font-size: 0.78rem; }
  </style>
</head>
<body>

  <div class="header">
    <h1>${title}</h1>
    <p>${subtitle} &nbsp;·&nbsp; ${runAt}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="label">Result</div>
      <div class="value">
        <span class="result-badge ${allPassed ? 'result-pass' : 'result-fail'}">
          ${allPassed ? '✅ PASSED' : '❌ FAILED'}
        </span>
      </div>
    </div>
    <div class="stat">
      <div class="label">Total Requests</div>
      <div class="value">${globalReqs ? Math.round(globalReqs.count || 0).toLocaleString() : '—'}</div>
    </div>
    <div class="stat">
      <div class="label">Error Rate</div>
      <div class="value ${globalFail && globalFail.rate > 0.01 ? 'bad' : 'good'}">${pct(globalFail ? globalFail.rate : null)}</div>
    </div>
    <div class="stat">
      <div class="label">p95 (global)</div>
      <div class="value ${globalDur && globalDur['p(95)'] > 500 ? 'bad' : 'good'}">${ms(globalDur ? globalDur['p(95)'] : null)}</div>
    </div>
    <div class="stat">
      <div class="label">avg (global)</div>
      <div class="value">${ms(globalDur ? globalDur.avg : null)}</div>
    </div>
  </div>

  ${moduleSummaryHtml}

  ${slowestTag ? `
  <div class="slowest">
    ⚠️ <strong>Slowest endpoint (p95):</strong> <code>${slowestTag}</code> — ${ms(slowestP95)}
  </div>` : ''}

  <div class="cards-grid">
    ${cards}
  </div>

  <div class="footer">
    Generated by k6 &nbsp;·&nbsp; ${title} &nbsp;·&nbsp; ${runAt}
  </div>

</body>
</html>`;
}
