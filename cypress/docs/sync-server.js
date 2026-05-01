#!/usr/bin/env node
/**
 * sync-server.js
 *
 * Local HTTP server that powers TEST_CASES.html:
 *
 *   🔄 Sync button  — runs sync-test-cases.js and reloads the page
 *   ▶  Run button   — triggers `cypress run --browser chrome --headed --spec …`
 *                     streams Cypress CLI output, then reads the mochawesome
 *                     HTML report for detailed pass/fail results
 *   📋 Reports tab  — saves each run to run-history, serves the list
 *
 * Usage:
 *   npm run sync-server
 */

'use strict';

const http    = require('http');
const { execFile, spawn } = require('child_process');
const path    = require('path');
const url     = require('url');
const fs      = require('fs');

const PORT         = 7357;
const ROOT         = path.join(__dirname, '..', '..');
const SYNC_SCRIPT  = path.join(__dirname, 'sync-test-cases.js');
const DASHBOARD    = path.join(__dirname, 'TEST_CASES.html');
const REPORT_HTML  = path.join(ROOT, 'cypress', 'reports', 'html', 'index.html');
const HISTORY_DIR  = path.join(__dirname, 'run-history');

// Ensure run-history directory exists
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ── CORS ──────────────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── / (serve dashboard HTML) ──────────────────────────────────────────────────
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

// ── /ping ─────────────────────────────────────────────────────────────────────
function handlePing(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// ── /sync ─────────────────────────────────────────────────────────────────────
function handleSync(res) {
  console.log(`[${ts()}] 🔄  Sync triggered`);
  execFile('node', [SYNC_SCRIPT], { cwd: ROOT }, (err, stdout, stderr) => {
    const output = stdout + (stderr ? '\nSTDERR:\n' + stderr : '');
    console.log(stdout.trim());
    res.writeHead(err ? 500 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: !err, output }));
  });
}

// ── /reports (list) ───────────────────────────────────────────────────────────
function handleReportsList(res) {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const raw  = fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8');
          const data = JSON.parse(raw);
          return {
            file:    f,
            label:   data.label  || f,
            spec:    data.spec   || '',
            time:    data.time   || '',
            passes:  data.passes || 0,
            failures:data.failures || 0,
            total:   data.total  || 0,
            duration:data.duration || 0,
            ok:      data.ok !== false,
          };
        } catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.file.localeCompare(a.file)); // newest first
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, reports: files }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

// ── /reports/get?file=X ───────────────────────────────────────────────────────
function handleReportGet(req, res) {
  const { file } = url.parse(req.url, true).query;
  if (!file || file.includes('..')) { res.writeHead(400); res.end('Bad file'); return; }
  try {
    const data = fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }
}

// ── /reports/delete (POST) ────────────────────────────────────────────────────
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

// ── Strip ANSI escape codes from a string ─────────────────────────────────────
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '');
}

// ── Extract mochawesome JSON from its HTML report ─────────────────────────────
function readMochawesomeReport() {
  try {
    if (!fs.existsSync(REPORT_HTML)) {
      console.error('[mochawesome] HTML not found:', REPORT_HTML);
      return null;
    }
    const html = fs.readFileSync(REPORT_HTML, 'utf8');

    const ATTR = 'data-raw="';
    const attrPos = html.indexOf(ATTR);
    if (attrPos === -1) {
      console.error('[mochawesome] data-raw attribute not found in HTML');
      return null;
    }

    const valStart = attrPos + ATTR.length;
    const valEnd   = html.indexOf('"', valStart);
    if (valEnd === -1) { console.error('[mochawesome] data-raw closing quote not found'); return null; }

    const raw = html.slice(valStart, valEnd)
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g,  "'")
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>');

    const parsed = JSON.parse(raw);
    const s = parsed.stats || {};
    console.log(`[mochawesome] OK — tests:${s.tests} passed:${s.passes} failed:${s.failures}`);
    return parsed;
  } catch (e) {
    console.error('[mochawesome] extraction failed:', e.message);
    return null;
  }
}

// Flatten mochawesome results into {passes, failures} arrays
function parseMochawesomeResults(mj) {
  const passes   = [];
  const failures = [];

  function walkSuites(suites, file) {
    if (!Array.isArray(suites)) return;
    suites.forEach(suite => {
      (suite.tests || []).forEach(t => {
        const entry = {
          title:    t.fullTitle || t.title || '',
          file:     file || suite.file || '',
          duration: t.duration || 0,
        };
        if (t.pass)  passes.push(entry);
        if (t.fail)  failures.push({ ...entry, err: { message: t.err && t.err.message, stack: t.err && t.err.estack } });
      });
      walkSuites(suite.suites, file || suite.file);
    });
  }

  (mj.results || []).forEach(r => {
    const file = r.fullFile || r.file || '';
    walkSuites(r.suites, file);
  });

  return { passes, failures, stats: mj.stats };
}

// ── /run?spec=<path> ──────────────────────────────────────────────────────────
function handleRun(req, res) {
  const query = url.parse(req.url, true).query;
  const spec  = query.spec;
  const mode  = query.mode === 'headless' ? 'headless' : 'headed';
  if (!spec) { res.writeHead(400); res.end('Missing ?spec='); return; }

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  console.log(`[${ts()}] ▶  Running spec (${mode}): ${spec}`);
  send({ status: 'starting', spec, mode });

  const args = ['cypress', 'run', '--browser', 'chrome'];
  if (mode === 'headed') args.push('--headed');
  args.push('--spec', spec);
  const child = spawn('npx', args, { cwd: ROOT, shell: true });

  let currentFile  = '';
  let specTotal    = 0;
  let specPasses   = 0;
  let specFailures = 0;
  let lineBuffer   = '';

  const processLine = (rawLine) => {
    const line = stripAnsi(rawLine);

    const runMatch = line.match(/Running:\s+(\S+\.cy\.[jt]s)/);
    if (runMatch) {
      currentFile = runMatch[1];
      send({ status: 'file-start', file: currentFile });
      return;
    }

    const tblMatch = line.match(/[✓✗✘√x]\s+\S+\.cy\.[jt]s\s+[\d:]+\s+(\d+)\s+(\d+)\s+(\d+|-)/);
    if (tblMatch) {
      const total = parseInt(tblMatch[1], 10);
      const pass  = parseInt(tblMatch[2], 10);
      const fail  = tblMatch[3] === '-' ? 0 : parseInt(tblMatch[3], 10);
      specTotal    += total;
      specPasses   += pass;
      specFailures += fail;
      send({ status: 'spec-done', file: currentFile, total, pass, fail, specTotal, specPasses, specFailures });
      return;
    }

    send({ status: 'log', text: line + '\n' });
  };

  const processChunk = (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();
    lines.forEach(l => processLine(l));
  };

  child.stdout.on('data', processChunk);
  child.stderr.on('data', (chunk) => send({ status: 'log', text: chunk.toString() }));

  child.on('close', (code) => {
    if (lineBuffer.trim()) processLine(lineBuffer);
    const ok = code === 0;

    const mj = readMochawesomeReport();
    let report = { passes: [], failures: [], stats: null, specTotal, specPasses, specFailures };
    if (mj) {
      const parsed = parseMochawesomeResults(mj);
      report = { ...parsed, specTotal, specPasses, specFailures };
    }

    console.log(`[${ts()}] ${ok ? '✅' : '❌'}  Run finished (exit ${code}) — ${report.passes.length} passed, ${report.failures.length} failed`);
    send({ status: 'done', ok, exitCode: code, report });

    const now      = new Date();
    const safeName = spec.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
    const fname    = `${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${safeName}.json`;
    const histPasses   = report.passes.length   || specPasses   || 0;
    const histFailures = report.failures.length || specFailures || 0;
    const histTotal    = histPasses + histFailures;

    const toSave = {
      label:    spec.split('/').pop().replace('**', 'all'),
      spec,
      time:     now.toLocaleString(),
      ok,
      passes:   histPasses,
      failures: histFailures,
      total:    histTotal,
      duration: report.stats && report.stats.duration ? report.stats.duration : 0,
      detail:   report,
    };
    try {
      fs.writeFileSync(path.join(HISTORY_DIR, fname), JSON.stringify(toSave, null, 2));
      console.log(`[${ts()}] 💾  Saved run history: ${fname}`);
      pruneRunHistory(10);
    } catch (e) {
      console.error('Could not save run history:', e.message);
    }

    res.end();
  });

  child.on('error', (err) => {
    console.error('Failed to start cypress:', err.message);
    send({ status: 'error', message: err.message });
    res.end();
  });

  req.on('close', () => {
    if (child.exitCode === null) { child.kill(); console.log(`[${ts()}] Client disconnected — killed run`); }
  });
}

// ── Prune run-history: keep only the latest N reports ─────────────────────────
function pruneRunHistory(keep) {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    if (files.length <= keep) return;
    const toDelete = files.slice(keep);
    toDelete.forEach(f => fs.unlinkSync(path.join(HISTORY_DIR, f)));
    console.log(`[${ts()}] 🗑️  Pruned ${toDelete.length} old report(s), keeping latest ${keep}`);
  } catch (e) {
    console.error('Prune failed:', e.message);
  }
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { pathname } = url.parse(req.url);

  if (pathname === '/'  || pathname === '/index.html')             return handleDashboard(res);
  if (pathname === '/ping')                                        return handlePing(res);
  if (pathname === '/sync')                                        return handleSync(res);
  if (pathname === '/run')                                         return handleRun(req, res);
  if (pathname === '/reports'        && req.method === 'GET')      return handleReportsList(res);
  if (pathname === '/reports/get'    && req.method === 'GET')      return handleReportGet(req, res);
  if (pathname === '/reports/delete' && req.method === 'POST')     return handleReportsDelete(req, res);

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n✅  Sync server running at ${url}`);
  console.log(`    Open your browser at ${url}`);
  console.log(`    /ping  /sync  /run?spec=…  /reports  /reports/get  /reports/delete\n`);
  // Auto-open dashboard in the default browser
  const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').exec(`${openCmd} ${url}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} in use — killing old process…`);
    const killCmd = process.platform === 'win32'
      ? `powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`
      : `lsof -ti tcp:${PORT} | xargs kill -9`;
    require('child_process').exec(killCmd, () => {
      setTimeout(() => {
        server.listen(PORT, '127.0.0.1', () => {
          console.log(`✅  Sync server running at http://127.0.0.1:${PORT} (restarted)\n`);
        });
      }, 500);
    });
  } else {
    console.error('Server error:', err.message);
    process.exit(1);
  }
});

function ts() { return new Date().toLocaleTimeString(); }
