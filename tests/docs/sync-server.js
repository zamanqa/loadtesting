#!/usr/bin/env node
/**
 * sync-server.js
 *
 * Local HTTP server that powers TEST_CASES.html (k6 Load Test Dashboard):
 *
 *   /ping                — health-check
 *   /run?script=X        — run `npm run X` (k6 load test), stream output via SSE
 *   /stop                — kill the currently-running k6 process
 *   /reports             — list saved run-history JSON files
 *   /reports/get?file=X  — fetch one saved run record
 *   /reports/delete      — POST { files: [...] } to delete run records
 *
 * Usage:
 *   npm run dashboard
 */

'use strict';

const http            = require('http');
const { spawn }       = require('child_process');
const path            = require('path');
const url             = require('url');
const fs              = require('fs');

const PORT        = 7357;
const ROOT        = path.join(__dirname, '..', '..');   // project root
const DASHBOARD   = path.join(__dirname, 'TEST_CASES.html');
const HISTORY_DIR = path.join(__dirname, 'run-history');

// ── Active k6 child process (one at a time) ───────────────────────────────────
let activeK6Child = null;

// Ensure run-history directory exists
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function ts() { return new Date().toLocaleTimeString(); }

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/** Strip ANSI colour codes */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '');
}

/** Keep only the newest `keep` JSON files in HISTORY_DIR */
function pruneRunHistory(keep = 30) {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    if (files.length <= keep) return;
    files.slice(keep).forEach(f => fs.unlinkSync(path.join(HISTORY_DIR, f)));
    console.log(`[${ts()}] 🗑️  Pruned ${files.length - keep} old report(s)`);
  } catch (e) {
    console.error('Prune failed:', e.message);
  }
}

// ── k6 test-file parser ───────────────────────────────────────────────────────
const LOAD_TEST_DIR = path.join(ROOT, 'cypress', 'e2e', 'load');

const LOAD_TEST_FILES = [
  { file: 'all-modules.load.test.js',        id: 'all',                 script: 'all:load',                label: 'All Modules' },
  { file: 'orders.load.test.js',             id: 'orders',              script: 'orders:load',             label: 'Orders' },
  { file: 'subscriptions.load.test.js',      id: 'subscriptions',       script: 'subscriptions:load',      label: 'Subscriptions' },
  { file: 'customers.load.test.js',          id: 'customers',           script: 'customers:load',          label: 'Customers' },
  { file: 'invoices.load.test.js',           id: 'invoices',            script: 'invoices:load',           label: 'Invoices' },
  { file: 'transactions.load.test.js',       id: 'transactions',        script: 'transactions:load',       label: 'Transactions' },
  { file: 'draft-orders.load.test.js',       id: 'draft-orders',        script: 'draft-orders:load',       label: 'Draft Orders' },
  { file: 'recurring-payments.load.test.js', id: 'recurring-payments',  script: 'recurring-payments:load', label: 'Recurring Payments' },
  { file: 'products.load.test.js',           id: 'products',            script: 'products:load',           label: 'Products' },
  { file: 'retailers.load.test.js',          id: 'retailers',           script: 'retailers:load',          label: 'Retailers' },
  { file: 'vouchers.load.test.js',           id: 'vouchers',            script: 'vouchers:load',           label: 'Vouchers' },
];

/** Extract ENDPOINTS array entries: { tag, p95, p90? } */
function parseEndpoints(content) {
  const m = content.match(/const\s+ENDPOINTS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) return [];
  const block = m[1];
  const results = [];
  // Match { tag: 'foo.bar', p95: 1100, p90: 1000 } in any order
  const re = /\{[^}]*tag:\s*['"]([^'"]+)['"][^}]*p95:\s*(\d+)[^}]*(?:p90:\s*(\d+))?[^}]*\}/g;
  let em;
  while ((em = re.exec(block)) !== null) {
    results.push({ tag: em[1], p95: parseInt(em[2]), p90: em[3] ? parseInt(em[3]) : null });
  }
  return results;
}

/** Extract stages → maxVUs and totalDurationSec */
function parseStages(content) {
  const m = content.match(/stages:\s*\[([\s\S]*?)\]/);
  if (!m) return { maxVUs: 5, totalDurationSec: 30 };
  const block = m[1];
  let maxVUs = 0, totalSec = 0;
  const re = /duration:\s*['"](\d+)([smh])['"]\s*,\s*target:\s*(\d+)/g;
  let sm;
  while ((sm = re.exec(block)) !== null) {
    const n = parseInt(sm[1]);
    const sec = sm[2] === 's' ? n : sm[2] === 'm' ? n * 60 : n * 3600;
    const t = parseInt(sm[3]);
    totalSec += sec;
    if (t > maxVUs) maxVUs = t;
  }
  return { maxVUs, totalDurationSec: totalSec };
}

/** Extract label map from REPORT_CONFIG: { 'mod.ep_tag': 'GET /path' } */
function parseLabels(content) {
  const labels = {};
  // Matches: 'orders.get_list': 'GET /orders (list)'
  const re = /['"]([a-z_]+\.[a-z_]+)['"]\s*:\s*['"]((GET|POST|PUT|DELETE|PATCH)[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) labels[m[1]] = m[2];
  return labels;
}

function formatDuration(totalSec) {
  if (totalSec < 60)   return `${totalSec}s`;
  if (totalSec < 3600) return `${Math.round(totalSec / 60)} min`;
  return `${(totalSec / 3600).toFixed(1)} hr`;
}

function handleMeta(res) {
  const modules = [];
  for (const { file, id, script, label } of LOAD_TEST_FILES) {
    const filePath = path.join(LOAD_TEST_DIR, file);
    if (!fs.existsSync(filePath)) { console.warn(`[meta] missing: ${file}`); continue; }
    try {
      const content     = fs.readFileSync(filePath, 'utf8');
      const endpoints   = parseEndpoints(content);
      const { maxVUs, totalDurationSec } = parseStages(content);
      const labels      = parseLabels(content);
      modules.push({
        id, script, label,
        vus:      maxVUs,
        duration: formatDuration(totalDurationSec),
        endpoints: endpoints.map(ep => ({
          tag:   ep.tag,
          label: labels[ep.tag] || ep.tag,
          p95:   ep.p95,
          p90:   ep.p90 ?? Math.round(ep.p95 * 0.9),
        })),
      });
    } catch (e) { console.error(`[meta] parse error ${file}:`, e.message); }
  }
  console.log(`[${ts()}] /meta → ${modules.length} modules, ${modules.reduce((s,m)=>s+m.endpoints.length,0)} endpoints`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, modules }));
}

// ── Route handlers ────────────────────────────────────────────────────────────

function handleDashboard(res) {
  try {
    const html = fs.readFileSync(DASHBOARD, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500);
    res.end('Could not read TEST_CASES.html: ' + e.message);
  }
}

function handlePing(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, activeRun: !!activeK6Child }));
}

function handleReportsList(res) {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
          return {
            file:              f,
            label:             data.label             || f,
            script:            data.script            || '',
            time:              data.time              || '',
            ok:                data.ok !== false,
            thresholdsPassed:  data.thresholdsPassed  || 0,
            thresholdsFailed:  data.thresholdsFailed  || 0,
            total:             data.total             || 0,
            durationSec:       data.durationSec       || 0,
          };
        } catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.file.localeCompare(a.file));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, reports: files }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function handleReportGet(req, res) {
  const { file } = url.parse(req.url, true).query;
  if (!file || file.includes('..')) { res.writeHead(400); res.end('Bad file'); return; }
  try {
    const data = fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }
}

function handleReportsDelete(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { files } = JSON.parse(body);
      let deleted = 0;
      (files || []).forEach(f => {
        if (f.includes('..')) return;
        const fp = path.join(HISTORY_DIR, f);
        if (fs.existsSync(fp)) { fs.unlinkSync(fp); deleted++; }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deleted }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

function handleStop(res) {
  if (!activeK6Child) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'No active run' }));
    return;
  }
  try {
    activeK6Child.kill('SIGTERM');
    console.log(`[${ts()}] 🛑  k6 process killed by /stop`);
    activeK6Child = null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Stopped' }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

// ── k6 threshold line parser ──────────────────────────────────────────────────
/**
 * Parse a stripped k6 output line.
 * Returns { passed: bool, tag: string } when the line is a threshold result
 * for an ep-tagged metric, or null otherwise.
 *
 * k6 textSummary prints tagged sub-group lines as INDENTED rows, e.g.:
 *   "  ✓ { ep:orders.get_list }............: avg=342ms …"
 *   "  ✗ { ep:orders.get_by_id }..........: 0.00%  ✓ 0  ✗ 3"
 *   "  ✓ { module:orders }................: avg=713ms …"  ← skipped (no ep:)
 *
 * After stripAnsi + trim() the leading spaces are gone, leaving:
 *   "✓ { ep:orders.get_list }............: …"
 */
function parseThresholdLine(line) {
  const trimmed = line.trim();

  // Match "✓ { ep:<tag> }" — the actual k6 textSummary sub-group format
  const m = trimmed.match(/^([✓✗])\s+\{\s*ep:([^}]+?)\s*\}/);
  if (!m) return null;

  const passed = m[1] === '✓';
  const tag    = m[2].trim();   // e.g. "orders.get_list"

  return { passed, metric: `{ep:${tag}}`, tag };
}

// ── /run?script=X  (SSE stream) ───────────────────────────────────────────────
function handleK6Run(req, res) {
  const query  = url.parse(req.url, true).query;
  const script = query.script;

  if (!script) {
    res.writeHead(400);
    res.end('Missing ?script=');
    return;
  }

  // Guard: only alphanumeric, dash, colon (e.g. "orders:load", "all:load")
  if (!/^[\w:-]+$/.test(script)) {
    res.writeHead(400);
    res.end('Invalid script name');
    return;
  }

  if (activeK6Child) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'A run is already in progress. POST /stop first.' }));
    return;
  }

  // ── SSE headers ───────────────────────────────────────────────────────────
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };

  console.log(`[${ts()}] ▶  k6 run: npm run ${script}`);
  send({ status: 'starting', script });

  // npm run <script> — works on Windows (shell: true) and Unix
  const child = spawn('npm', ['run', script], {
    cwd:   ROOT,
    shell: true,
    env:   { ...process.env },
  });

  activeK6Child = child;

  let lineBuffer        = '';
  let thresholdsPassed  = 0;
  let thresholdsFailed  = 0;
  const thresholdDetails = [];   // collect per-threshold results for PDF
  const logLines         = [];   // raw terminal lines for PDF (capped at 3000)
  const startTime       = Date.now();

  const processLine = (rawLine) => {
    const line = stripAnsi(rawLine);
    if (!line.trim()) return;

    // Emit the log line to the browser
    send({ status: 'log', text: line + '\n' });
    if (logLines.length < 3000) logLines.push(line);

    // Parse threshold results
    const th = parseThresholdLine(line);
    if (th) {
      if (th.passed) {
        thresholdsPassed++;
        send({ status: 'threshold', passed: true,  metric: th.metric, tag: th.tag });
      } else {
        thresholdsFailed++;
        send({ status: 'threshold', passed: false, metric: th.metric, tag: th.tag });
      }
      thresholdDetails.push({ metric: th.metric, tag: th.tag, passed: th.passed });
    }
  };

  const processChunk = (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer  = lines.pop();           // keep incomplete last line
    lines.forEach(processLine);
  };

  child.stdout.on('data', processChunk);
  child.stderr.on('data', (chunk) => {
    // stderr often carries k6 progress bars — strip ANSI, still send
    const text = stripAnsi(chunk.toString());
    if (text.trim()) send({ status: 'log', text: text + '\n' });
  });

  child.on('close', (code) => {
    if (lineBuffer.trim()) processLine(lineBuffer);

    activeK6Child = null;
    const ok          = code === 0;
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    const total       = thresholdsPassed + thresholdsFailed;

    console.log(
      `[${ts()}] ${ok ? '✅' : '❌'}  k6 done (exit ${code}) — ` +
      `✓ ${thresholdsPassed} / ✗ ${thresholdsFailed} thresholds`
    );

    send({ status: 'done', ok, exitCode: code, thresholdsPassed, thresholdsFailed, total, durationSec });

    // ── Save run history ──────────────────────────────────────────────────
    try {
      const now      = new Date();
      const safeName = script.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fname    = `${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${safeName}.json`;
      const record   = {
        label:            script,
        script,
        time:             now.toLocaleString(),
        ok,
        exitCode:         code,
        thresholdsPassed,
        thresholdsFailed,
        total,
        durationSec,
        thresholds:       thresholdDetails,   // full per-threshold detail for PDF
        logLines,                             // raw terminal output for PDF
      };
      fs.writeFileSync(path.join(HISTORY_DIR, fname), JSON.stringify(record, null, 2));
      console.log(`[${ts()}] 💾  Run history saved: ${fname}`);
      pruneRunHistory(5);   // keep only last 5 reports
    } catch (e) {
      console.error('Could not save run history:', e.message);
    }

    try { res.end(); } catch (_) {}
  });

  child.on('error', (err) => {
    activeK6Child = null;
    console.error(`[${ts()}] k6 spawn error:`, err.message);
    send({ status: 'error', message: err.message });
    try { res.end(); } catch (_) {}
  });

  // If the browser disconnects, kill the child
  req.on('close', () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      activeK6Child = null;
      console.log(`[${ts()}] Client disconnected — killed k6 process`);
    }
  });
}

// ── PDF report generator ──────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generatePdfHtml(record) {
  const {
    label = '', script = '', time = '', ok = false,
    thresholdsPassed = 0, thresholdsFailed = 0, total = 0,
    durationSec = 0, logLines = [],
  } = record;

  const passRate = total > 0 ? ((thresholdsPassed / total) * 100).toFixed(1) : '0.0';
  const durLabel = durationSec < 60 ? `${durationSec}s`
    : durationSec < 3600 ? `${Math.round(durationSec/60)} min`
    : `${(durationSec/3600).toFixed(1)} hr`;

  // ── Extract k6 summary section (starts at first dotted metric line) ──────────
  const SUMMARY_START_RE = /^\s*(data_received|checks|vus_max|vus\b|iterations\b|http_req)/;
  let summaryIdx = logLines.findIndex(l => SUMMARY_START_RE.test(l));
  if (summaryIdx < 0) summaryIdx = logLines.findIndex(l => /^\s*\w[\w_]*\.{4,}:/.test(l));
  const summaryLines = summaryIdx >= 0 ? logLines.slice(summaryIdx) : logLines.slice(-80);
  const setupLines   = summaryIdx >= 0 ? logLines.slice(0, summaryIdx) : [];

  // Colour-code a single terminal line for PDF
  function termLine(line) {
    const t = esc(line);
    if (/^\s+[✓✔]\s/.test(line))                                    return `<span class="t-pass">${t}</span>`;
    if (/^\s+[✗✘]\s/.test(line))                                    return `<span class="t-fail">${t}</span>`;
    if (/ERRO|error/i.test(line) && !/http_req/.test(line))                   return `<span class="t-fail">${t}</span>`;
    if (/WARN/i.test(line))                                                   return `<span class="t-warn">${t}</span>`;
    if (/INFO|setup|teardown/i.test(line))                                    return `<span class="t-info">${t}</span>`;
    if (/^\s*(data_received|data_sent|http_req|vus|checks|iterations|iteration_duration)/.test(line)) return `<span class="t-metric">${t}</span>`;
    if (/^={3}|PASSED|FAILED/.test(line))                                     return `<span class="t-bold">${t}</span>`;
    return t;
  }

  const summaryHtml = summaryLines.map(termLine).join('\n');
  const setupHtml   = setupLines.map(termLine).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>k6 Report — ${esc(label)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d0f1c; color: #c9d1d9; font-size: 13px; line-height: 1.5; }

  /* Header bar */
  .report-header {
    background: #161827; border-bottom: 1px solid #2a2d50;
    padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; gap: 20px;
  }
  .report-header h1 { font-size: 1.1rem; font-weight: 700; color: #e2e8f0; margin-bottom: 3px; }
  .report-header .sub { font-size: 0.75rem; color: #6c7bf0; font-family: 'Consolas', monospace; }
  .badge-result { padding: 5px 16px; border-radius: 6px; font-size: 0.82rem; font-weight: 700; white-space: nowrap; font-family: monospace; }
  .badge-pass { background: #14532d; color: #4ade80; border: 1px solid #166534; }
  .badge-fail { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }

  /* Stat row */
  .stat-row { display: flex; gap: 1px; background: #2a2d50; border-bottom: 1px solid #2a2d50; }
  .stat-box { flex: 1; background: #161827; padding: 12px 18px; text-align: center; }
  .stat-box .num { font-size: 1.5rem; font-weight: 700; font-family: 'Consolas', monospace; }
  .stat-box .num.green { color: #4ade80; }
  .stat-box .num.red   { color: #f87171; }
  .stat-box .num.blue  { color: #818cf8; }
  .stat-box .lbl { font-size: 0.65rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }

  /* Section */
  .section { padding: 12px 20px; }
  .section-title {
    font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    color: #6c7bf0; margin-bottom: 10px; padding-bottom: 6px;
    border-bottom: 1px solid #2a2d50; font-family: 'Consolas', monospace;
  }

  /* Terminal block */
  .terminal {
    background: #0a0b14; border: 1px solid #1e2040; border-radius: 6px;
    padding: 12px 14px; overflow: visible;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 0.65rem; line-height: 1.6; white-space: pre; color: #9ba3c4;
  }
  .t-pass   { color: #4ade80; }
  .t-fail   { color: #f87171; }
  .t-info   { color: #818cf8; }
  .t-warn   { color: #fbbf24; }
  .t-metric { color: #a5b4fc; }
  .t-bold   { color: #e2e8f0; font-weight: 700; }

  /* Footer */
  .report-footer {
    padding: 12px 28px; background: #161827; border-top: 1px solid #2a2d50;
    font-size: 0.68rem; color: #475569; display: flex; justify-content: space-between;
    font-family: monospace;
  }

  /* Print button */
  .print-btn {
    position: fixed; bottom: 22px; right: 22px;
    background: #6c7bf0; color: #fff; border: none;
    padding: 10px 20px; border-radius: 8px; font-size: 0.82rem; font-weight: 600;
    cursor: pointer; box-shadow: 0 4px 16px rgba(108,123,240,0.4);
  }
  .print-btn:hover { background: #5a69e0; }
</style>
</head>
<body>

<div class="report-header">
  <div>
    <div style="font-size:0.65rem;color:#525880;font-weight:600;letter-spacing:1.2px;margin-bottom:4px;">K6 LOAD TEST REPORT</div>
    <h1>${esc(label)}</h1>
    <div class="sub">npm run ${esc(script)} &nbsp;&middot;&nbsp; ${esc(time)}</div>
  </div>
  <div class="badge-result ${ok ? 'badge-pass' : 'badge-fail'}">${ok ? '✓ PASSED' : '✗ FAILED'}</div>
</div>

<div class="stat-row">
  <div class="stat-box"><div class="num blue">${esc(durLabel)}</div><div class="lbl">Duration</div></div>
  <div class="stat-box"><div class="num blue">${total}</div><div class="lbl">Thresholds</div></div>
  <div class="stat-box"><div class="num green">${thresholdsPassed}</div><div class="lbl">Passed</div></div>
  <div class="stat-box"><div class="num red">${thresholdsFailed}</div><div class="lbl">Failed</div></div>
  <div class="stat-box"><div class="num ${ok ? 'green' : 'red'}">${passRate}%</div><div class="lbl">Pass Rate</div></div>
</div>

${summaryLines.length > 0 ? `
<div class="section">
  <div class="section-title">k6 metrics summary</div>
  <div class="terminal">${summaryHtml}</div>
</div>` : ''}

${setupLines.length > 0 ? `
<div class="section page-break">
  <div class="section-title">run log</div>
  <div class="terminal">${setupHtml}</div>
</div>` : ''}

<div class="report-footer">
  <span>k6 Load Test Dashboard · Circuly API v2026-04</span>
  <span>Generated ${new Date().toLocaleString()}</span>
</div>

<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>

</body>
</html>`;
}

function handleReportPdf(req, res) {
  const { file } = url.parse(req.url, true).query;
  if (!file || file.includes('..')) { res.writeHead(400); res.end('Bad file'); return; }
  try {
    const record = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
    const html   = generatePdfHtml(record);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(404); res.end('Report not found: ' + e.message);
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { pathname } = url.parse(req.url);

  if (pathname === '/' || pathname === '/index.html')           return handleDashboard(res);
  if (pathname === '/ping')                                     return handlePing(res);
  if (pathname === '/meta'          && req.method === 'GET')    return handleMeta(res);
  if (pathname === '/run'           && req.method === 'GET')    return handleK6Run(req, res);
  if (pathname === '/stop'          && req.method === 'POST')   return handleStop(res);
  if (pathname === '/reports'        && req.method === 'GET')   return handleReportsList(res);
  if (pathname === '/reports/get'    && req.method === 'GET')   return handleReportGet(req, res);
  if (pathname === '/reports/pdf'    && req.method === 'GET')   return handleReportPdf(req, res);
  if (pathname === '/reports/delete' && req.method === 'POST')  return handleReportsDelete(req, res);

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  const dashUrl = `http://127.0.0.1:${PORT}`;
  console.log(`\n✅  k6 Load Test Dashboard running at ${dashUrl}`);
  console.log(`    Routes: /ping  /run?script=X  /stop  /reports  /reports/get  /reports/delete`);
  console.log(`    Example: ${dashUrl}/run?script=orders:load\n`);

  // Auto-open in default browser
  const openCmd = process.platform === 'win32' ? 'start'
                : process.platform === 'darwin' ? 'open'
                : 'xdg-open';
  require('child_process').exec(`${openCmd} ${dashUrl}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} in use — killing old process…`);
    const killCmd = process.platform === 'win32'
      ? `powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`
      : `lsof -ti tcp:${PORT} | xargs kill -9`;
    require('child_process').exec(killCmd, () => {
      setTimeout(() => server.listen(PORT, '127.0.0.1', () =>
        console.log(`✅  k6 Dashboard running at http://127.0.0.1:${PORT} (restarted)\n`)
      ), 500);
    });
  } else {
    console.error('Server error:', err.message);
    process.exit(1);
  }
});
