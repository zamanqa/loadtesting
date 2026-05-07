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
 * Returns { passed: bool, tag: string } when the line is a threshold result,
 * or null otherwise.
 *
 * k6 threshold lines look like one of:
 *   ✓ http_req_duration{ep:orders.get_list}............: avg=...
 *   ✗ http_req_failed{ep:orders.get_list}..............: rate=...
 *   ✓ checks{ep:orders.get_list}......................: rate=...
 *   ✓ http_req_duration{module:orders}................: ...
 */
function parseThresholdLine(line) {
  const trimmed = line.trim();

  // Match lines starting with ✓ or ✗ that contain a k6 metric name
  const m = trimmed.match(/^([✓✗])\s+([\w_]+\{[^}]+\}|[\w_]+)\s*[.:]/);
  if (!m) return null;

  const passed = m[1] === '✓';
  const metric = m[2]; // e.g. "http_req_duration{ep:orders.get_list}"

  // Extract the tag value from inside {}
  const tagMatch = metric.match(/\{ep:([^}]+)\}/);
  const tag = tagMatch ? tagMatch[1] : null;

  return { passed, metric, tag };
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
    durationSec = 0, thresholds = [], logLines = [],
  } = record;

  const passRate = total > 0 ? ((thresholdsPassed / total) * 100).toFixed(1) : '0.0';

  // Group threshold rows by endpoint tag prefix (e.g. "orders.get_list")
  // One logical row per tag, columns: tag | duration p95/p99 | failed rate | checks
  const byTag = {};
  for (const t of thresholds) {
    const tag = t.tag || t.metric;
    if (!byTag[tag]) byTag[tag] = { tag, items: [] };
    byTag[tag].items.push(t);
  }
  // Also keep ungrouped metrics (no ep: tag)
  const ungrouped = thresholds.filter(t => !t.tag);

  // Colour-code a single raw log line for the PDF terminal block
  function termLine(line) {
    const t = esc(line);
    if (/^\s+✓/.test(line))                                           return `<span class="t-pass">${t}</span>`;
    if (/^\s+✗/.test(line))                                           return `<span class="t-fail">${t}</span>`;
    if (/ERRO|error/i.test(line))                                     return `<span class="t-fail">${t}</span>`;
    if (/WARN/i.test(line))                                           return `<span class="t-warn">${t}</span>`;
    if (/INFO|setup|teardown/i.test(line))                            return `<span class="t-info">${t}</span>`;
    if (/http_req_duration|http_req_failed|checks|http_reqs/.test(line)) return `<span class="t-metric">${t}</span>`;
    if (/^={3}|^\s*✓\s*PASS|^\s*✗\s*FAIL/.test(line))               return `<span class="t-bold">${t}</span>`;
    return t;
  }

  const terminalHtml = logLines.length > 0
    ? `<div class="section page-break">
        <h2>Terminal Output</h2>
        <div class="terminal">${logLines.map(termLine).join('\n')}</div>
      </div>`
    : '';

  const tagRows = Object.values(byTag).map(({ tag, items }) => {
    const allPass = items.every(i => i.passed);
    const metrics = items.map(i => {
      const mname = i.metric.replace(/\{[^}]+\}/g, '');
      return `<span class="chip ${i.passed ? 'green' : 'red'}">${esc(mname)}</span>`;
    }).join('');
    return `<tr>
      <td class="tag-cell">${esc(tag)}</td>
      <td>${metrics}</td>
      <td class="${allPass ? 'pass-cell' : 'fail-cell'}">${allPass ? '✓ PASS' : '✗ FAIL'}</td>
    </tr>`;
  }).join('');

  const ungroupedRows = ungrouped.map(t => `<tr>
    <td class="tag-cell" colspan="2" style="color:#64748b;font-size:0.78rem;">${esc(t.metric)}</td>
    <td class="${t.passed ? 'pass-cell' : 'fail-cell'}">${t.passed ? '✓' : '✗'}</td>
  </tr>`).join('');

  const durLabel = durationSec < 60 ? `${durationSec}s`
    : durationSec < 3600 ? `${Math.round(durationSec/60)} min`
    : `${(durationSec/3600).toFixed(1)} hr`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>k6 Report — ${esc(label)}</title>
<style>
  @page { margin: 18mm 16mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #1e293b; font-size: 13px; line-height: 1.5; }

  /* ── Header ── */
  .report-header { background: #1a1b2e; color: #fff; padding: 28px 36px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .report-header h1 { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 4px; }
  .report-header .sub { font-size: 0.78rem; color: #a5b4fc; }
  .badge-result { padding: 6px 18px; border-radius: 8px; font-size: 0.9rem; font-weight: 700; white-space: nowrap; }
  .badge-pass { background: #14532d; color: #4ade80; border: 1px solid #166534; }
  .badge-fail { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }

  /* ── Summary cards ── */
  .summary { display: flex; gap: 16px; padding: 24px 36px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 22px; min-width: 120px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .card .num { font-size: 1.8rem; font-weight: 700; color: #4f46e5; }
  .card .num.green { color: #16a34a; }
  .card .num.red   { color: #dc2626; }
  .card .lbl { font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.7px; margin-top: 3px; }

  /* ── Section ── */
  .section { padding: 24px 36px; }
  .section h2 { font-size: 0.88rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #475569; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th { text-align: left; padding: 9px 14px; background: #f1f5f9; color: #475569; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 2px solid #e2e8f0; font-weight: 600; }
  td { padding: 8px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .tag-cell { font-family: 'Consolas', monospace; color: #4f46e5; font-size: 0.78rem; }
  .pass-cell { color: #16a34a; font-weight: 700; white-space: nowrap; }
  .fail-cell { color: #dc2626; font-weight: 700; white-space: nowrap; }
  .chip { display: inline-block; font-size: 0.68rem; padding: 2px 7px; border-radius: 4px; margin: 1px; font-family: monospace; white-space: nowrap; }
  .chip.green { background: #dcfce7; color: #15803d; }
  .chip.red   { background: #fee2e2; color: #b91c1c; }

  /* ── Footer ── */
  .report-footer { padding: 16px 36px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 0.72rem; color: #94a3b8; display: flex; justify-content: space-between; }

  /* ── Terminal log ── */
  .terminal { background: #0d0f1c; border-radius: 8px; padding: 16px 18px; overflow-x: auto; font-family: 'Consolas', 'Courier New', monospace; font-size: 0.75rem; line-height: 1.6; white-space: pre; color: #9ba3c4; margin-top: 4px; }
  .terminal .t-pass   { color: #4ade80; }
  .terminal .t-fail   { color: #f87171; }
  .terminal .t-info   { color: #818cf8; }
  .terminal .t-warn   { color: #fbbf24; }
  .terminal .t-metric { color: #a5b4fc; }
  .terminal .t-bold   { color: #e2e8f0; font-weight: 700; }

  /* ── Print button ── */
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #4f46e5; color: #fff; border: none; padding: 12px 22px; border-radius: 10px; font-size: 0.86rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 16px rgba(79,70,229,0.35); }
  .print-btn:hover { background: #4338ca; }
</style>
</head>
<body>

<div class="report-header">
  <div>
    <div style="font-size:0.72rem;color:#818cf8;font-weight:600;margin-bottom:6px;letter-spacing:1px;">K6 LOAD TEST REPORT</div>
    <h1>${esc(label)}</h1>
    <div class="sub">Script: <code style="color:#e0e7ff;">${esc(script)}</code> &nbsp;·&nbsp; ${esc(time)}</div>
  </div>
  <div class="badge-result ${ok ? 'badge-pass' : 'badge-fail'}">${ok ? '✓ PASSED' : '✗ FAILED'}</div>
</div>

<div class="summary">
  <div class="card"><div class="num">${esc(durLabel)}</div><div class="lbl">Duration</div></div>
  <div class="card"><div class="num">${total}</div><div class="lbl">Thresholds</div></div>
  <div class="card"><div class="num green">${thresholdsPassed}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num red">${thresholdsFailed}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="num ${ok ? 'green' : 'red'}">${passRate}%</div><div class="lbl">Pass Rate</div></div>
  <div class="card"><div class="num">${esc(record.vus || '—')}</div><div class="lbl">Max VUs</div></div>
</div>

${Object.keys(byTag).length > 0 ? `
<div class="section">
  <h2>Threshold Results — Per Endpoint</h2>
  <table>
    <thead><tr><th>Endpoint Tag</th><th>Metrics</th><th>Result</th></tr></thead>
    <tbody>${tagRows}</tbody>
  </table>
</div>` : ''}

${ungrouped.length > 0 ? `
<div class="section">
  <h2>Global Thresholds</h2>
  <table>
    <thead><tr><th colspan="2">Metric</th><th>Result</th></tr></thead>
    <tbody>${ungroupedRows}</tbody>
  </table>
</div>` : ''}

${terminalHtml}

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
