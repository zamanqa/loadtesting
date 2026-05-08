#!/usr/bin/env node
/**
 * sync-test-cases.js
 *
 * Fully syncs TEST_CASES.html with the actual *.cy.js spec files.
 *
 * What it does on every Sync click:
 *   ✓ Adds tests that were added to spec files
 *   ✓ Removes tests that were deleted from spec files
 *   ✓ Updates test titles that were renamed
 *   ✓ Adds entire sections for new spec files
 *   ✓ Removes entire sections for deleted spec files
 *   ✓ Updates all per-tab count badges
 *   ✓ Updates header totals (total tests, total files)
 *
 * Usage:
 *   node cypress/docs/sync-test-cases.js
 *   npm run sync-docs
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT      = path.join(__dirname, '..', '..');
const HTML_FILE = path.join(__dirname, 'TEST_CASES.html');
const E2E_DIR   = path.join(ROOT, 'cypress', 'e2e');

// ── Tab → folder mapping (must match accordion ids in the HTML) ──────────────
const TABS = [
  { id: 'tab1',  folder: 'customer-api/01-orders'             },
  { id: 'tab2',  folder: 'customer-api/02-customers'          },
  { id: 'tab3',  folder: 'customer-api/03-invoices'           },
  { id: 'tab4',  folder: 'customer-api/04-payments'           },
  { id: 'tab5',  folder: 'customer-api/05-subscriptions'      },
  { id: 'tab6',  folder: 'customer-api/06-deliveries'         },
  { id: 'tab7',  folder: 'customer-api/07-draft-orders'       },
  { id: 'tab8',  folder: 'customer-api/08-transactions'       },
  { id: 'tab9',  folder: 'customer-api/09-recurring-payments' },
  { id: 'tab10', folder: 'customer-api/10-product-tracking'   },
  { id: 'tab11', folder: 'customer-api/11-product'            },
  { id: 'tab12', folder: 'customer-api/12-retailers'          },
  { id: 'tab13', folder: 'customer-api/13-vouchers'           },
  { id: 'tab14', folder: 'customer-api/14-css'                },
  { id: 'tab15', folder: 'customer-api/15-notes'              },
  { id: 'tab16', folder: 'customer-api/16-debtist'            },
  { id: 'tab17', folder: 'customer-api/17-access-keys'        },
  { id: 'tab18', folder: 'customer-api/18-csv'                },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract all it('…') titles from a spec file. */
function extractItTitles(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const re  = /\bit\s*\(\s*(['"`])([\s\S]*?)\1\s*,/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[2].trim());
  return out;
}

/** HTML-escape a string. */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a single <tr> row. Status is always reset to Not Run on sync. */
function makeRow(num, title, statusKey) {
  return (
    `            <tr>` +
    `<td class="num">${num}</td>` +
    `<td class="testcase">${esc(title)}</td>` +
    `<td class="verify">—</td>` +
    `<td><span class="db-no">No</span></td>` +
    `<td><span class="status-badge not-run" onclick="cycleStatus(this,'${statusKey}')">Not Run</span></td>` +
    `</tr>`
  );
}

/** Build a complete accordion section div for a spec file. */
function makeAccSection(fileName, specPath, titles, tabId, fileIndex) {
  const n     = titles.length;
  const label = `${n} test${n !== 1 ? 's' : ''}`;
  const rows  = titles
    .map((t, i) => makeRow(i + 1, t, `${tabId}-f${fileIndex}-${i + 1}`))
    .join('\n');

  return (
    `      <div class="acc-section" data-file="${fileName}" data-spec="${specPath}">\n` +
    `        <div class="acc-header" onclick="toggleAcc(this)">\n` +
    `          <span class="acc-arrow">▶</span>\n` +
    `          <span class="acc-filename">${fileName}</span>\n` +
    `          <span class="acc-count">${label}</span>\n` +
    `          <button class="btn-run" onclick="runInCypress(event,this,'${specPath}')">▶ Run in Cypress</button>\n` +
    `        </div>\n` +
    `        <div class="acc-body">\n` +
    `          <table class="sheet"><thead><tr><th>#</th><th>Test Case</th><th>What is Verified</th><th>DB Verified</th><th>Last Run Status</th></tr></thead>\n` +
    `          <tbody>\n` +
    rows + '\n' +
    `          </tbody></table>\n` +
    `        </div>\n` +
    `      </div>`
  );
}

/**
 * Extract current titles already rendered in the HTML for a given spec section.
 * Returns an array of unescaped title strings.
 */
function extractRenderedTitles(html, sectionStart) {
  const tbodyOpen  = html.indexOf('<tbody>', sectionStart);
  const tbodyClose = html.indexOf('</tbody>', sectionStart);
  if (tbodyOpen === -1 || tbodyClose === -1) return [];

  const tbody = html.slice(tbodyOpen, tbodyClose);
  const re    = /<td class="testcase">([^<]*)<\/td>/g;
  const out   = [];
  let m;
  while ((m = re.exec(tbody)) !== null) {
    out.push(
      m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
    );
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function sync() {
  if (!fs.existsSync(HTML_FILE)) {
    console.error(`❌  Cannot find: ${HTML_FILE}`);
    process.exit(1);
  }

  let html    = fs.readFileSync(HTML_FILE, 'utf8');
  let changed = false;

  for (const tab of TABS) {
    const folderPath   = path.join(E2E_DIR, tab.folder);
    const accOpenMark  = `id="acc-${tab.id}"`;
    const accCloseMark = `<!-- /acc-${tab.id} -->`;

    const openIdx  = html.indexOf(accOpenMark);
    const closeIdx = html.indexOf(accCloseMark);
    if (openIdx === -1 || closeIdx === -1) {
      console.warn(`  ⚠  Accordion not found for ${tab.id} — skipping`);
      continue;
    }

    // Spec files currently on disk for this tab
    const specFiles = fs.existsSync(folderPath)
      ? fs.readdirSync(folderPath).filter(f => f.endsWith('.cy.js')).sort()
      : [];

    // Files already rendered in the HTML for this tab
    const tabSlice = html.slice(openIdx, closeIdx);
    const existingFiles = [];
    const dfRe = /data-file="([^"]+)"/g;
    let dfm;
    while ((dfm = dfRe.exec(tabSlice)) !== null) existingFiles.push(dfm[1]);

    // Check whether anything needs updating
    const removedFiles  = existingFiles.filter(f => !specFiles.includes(f));
    const addedFiles    = specFiles.filter(f => !existingFiles.includes(f));
    let   titlesChanged = false;

    if (removedFiles.length === 0 && addedFiles.length === 0) {
      // Check each existing file for title/count changes
      for (const fileName of specFiles) {
        const filePath    = path.join(folderPath, fileName);
        const liveTitles  = extractItTitles(filePath);
        const anchor      = html.indexOf(`data-file="${fileName}"`, openIdx);
        const rendered    = extractRenderedTitles(html, anchor);

        if (JSON.stringify(liveTitles) !== JSON.stringify(rendered)) {
          titlesChanged = true;
          break;
        }
      }
    }

    const needsRegen = removedFiles.length > 0 || addedFiles.length > 0 || titlesChanged;
    if (!needsRegen) {
      console.log(`  ✓  ${tab.folder}: up to date`);
      continue;
    }

    // ── Full regeneration for this tab ──────────────────────────────────────
    const newSections = specFiles.map((fileName, idx) => {
      const filePath = path.join(folderPath, fileName);
      const specPath = `cypress/e2e/${tab.folder}/${fileName}`;
      const titles   = extractItTitles(filePath);
      return makeAccSection(fileName, specPath, titles, tab.id, idx + 1);
    }).join('\n\n');

    // Find the end of the container's opening tag (the > after id="acc-tabN")
    const containerTagEnd = html.indexOf('>', openIdx) + 1;

    // Replace everything inside the accordion container
    html    = html.slice(0, containerTagEnd) + '\n\n' + newSections + '\n\n    ' + html.slice(closeIdx);
    changed = true;

    // Log what changed
    removedFiles.forEach(f => console.log(`  -  Removed section : ${f}`));
    addedFiles.forEach(f   => console.log(`  +  Added section   : ${f}`));
    if (titlesChanged)      console.log(`  ~  Updated titles  : ${tab.folder}`);

    // Count totals for this tab (post-update)
    const newSpecCounts = specFiles.map(f => extractItTitles(path.join(folderPath, f)).length);
    const tabTotal = newSpecCounts.reduce((s, n) => s + n, 0);
    console.log(`     ${tab.folder}: ${specFiles.length} file(s), ${tabTotal} test(s)`);
  }

  // ── Update all count badges ───────────────────────────────────────────────
  for (const tab of TABS) {
    const aOpen  = html.indexOf(`id="acc-${tab.id}"`);
    const aClose = html.indexOf(`<!-- /acc-${tab.id} -->`);
    if (aOpen === -1 || aClose === -1) continue;

    const slice    = html.slice(aOpen, aClose);
    const tabCount = (slice.match(/<td class="num">\d+<\/td>/g) || []).length;

    html = html.replace(
      new RegExp(`(<span class="badge" id="badge-${tab.id}">)\\d+(<\\/span>)`),
      `$1${tabCount}$2`
    );
  }

  // ── Update global header stats ────────────────────────────────────────────
  const totalTests = (html.match(/<td class="num">\d+<\/td>/g) || []).length;
  const totalFiles = (html.match(/class="acc-section"/g) || []).length;

  html = html.replace(
    /<div class="num" id="total-count">\d+<\/div>/,
    `<div class="num" id="total-count">${totalTests}</div>`
  );
  html = html.replace(
    /(<div class="stat-box"><div class="num">)\d+(<\/div><div class="lbl">Test Files<\/div><\/div>)/,
    `$1${totalFiles}$2`
  );
  html = html.replace(/<strong>\d+ test files<\/strong>/,          `<strong>${totalFiles} test files</strong>`);
  html = html.replace(/(<strong id="footer-total">)\d+(<\/strong>)/, `$1${totalTests}$2`);

  // ── Write ─────────────────────────────────────────────────────────────────
  const original = fs.readFileSync(HTML_FILE, 'utf8');
  if (html !== original || changed) {
    fs.writeFileSync(HTML_FILE, html, 'utf8');
    console.log(`\n✅  Synced — ${totalTests} total tests across ${totalFiles} files`);
  } else {
    console.log('\n✅  Already up to date — no changes needed');
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('🔄  Syncing TEST_CASES.html …\n');
try {
  sync();
} catch (err) {
  console.error('❌  Sync failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
