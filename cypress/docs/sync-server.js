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
  const startTime       = Date.now();

  const processLine = (rawLine) => {
    const line = stripAnsi(rawLine);
    if (!line.trim()) return;

    // Emit the log line to the browser
    send({ status: 'log', text: line + '\n' });

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
      };
      fs.writeFileSync(path.join(HISTORY_DIR, fname), JSON.stringify(record, null, 2));
      console.log(`[${ts()}] 💾  Run history saved: ${fname}`);
      pruneRunHistory(30);
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

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { pathname } = url.parse(req.url);

  if (pathname === '/' || pathname === '/index.html')           return handleDashboard(res);
  if (pathname === '/ping')                                     return handlePing(res);
  if (pathname === '/run'           && req.method === 'GET')    return handleK6Run(req, res);
  if (pathname === '/stop'          && req.method === 'POST')   return handleStop(res);
  if (pathname === '/reports'       && req.method === 'GET')    return handleReportsList(res);
  if (pathname === '/reports/get'   && req.method === 'GET')    return handleReportGet(req, res);
  if (pathname === '/reports/delete'&& req.method === 'POST')   return handleReportsDelete(req, res);

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
