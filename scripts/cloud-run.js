/**
 * cloud-run.js — wrapper for `k6 cloud run` that forwards .env variables
 * to the remote Frankfurt runner via explicit -e flags.
 *
 * Usage (via npm scripts):
 *   node scripts/cloud-run.js tests/smoke/all-modules.smoke.test.js
 *
 * Why this exists:
 *   `dotenv -- k6 cloud run -e BASE_URL=%BASE_URL%` doesn't work because
 *   Node.js (dotenv-cli) doesn't expand %VAR% shell placeholders.
 *   This script reads .env directly and passes real values to k6.
 */

require('dotenv').config();
const { spawnSync } = require('child_process');

const script = process.argv[2];
if (!script) {
  console.error('Usage: node scripts/cloud-run.js <test-script-path>');
  process.exit(1);
}

// Variables that must be forwarded to the remote k6 cloud runner
const FORWARD = ['BASE_URL', 'API_VERSION', 'CONSUMER_KEY', 'CONSUMER_SECRET', 'COMPANY_ID'];

const envFlags = FORWARD.flatMap((key) => {
  const value = process.env[key];
  if (!value) {
    console.warn(`[cloud-run] WARNING: ${key} is not set in .env`);
    return [];
  }
  return ['-e', `${key}=${value}`];
});

const args = ['cloud', 'run', ...envFlags, script];
console.log(`[cloud-run] k6 ${args.join(' ')}\n`);

const result = spawnSync('k6', args, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
