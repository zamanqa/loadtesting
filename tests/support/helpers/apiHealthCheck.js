/**
 * API Health Check — Server Wake-up Helper
 *
 * Call wakeUpServers() inside setup() to warm up Heroku dynos
 * before the test VUs start sending load.
 */

import http from 'k6/http';
import { sleep } from 'k6';

const HUB_API_URL     = 'https://circuly-lumen.herokuapp.com';
const CHECKOUT_API_URL = 'https://checkout-api-development-680576524870.europe-west3.run.app/v1/version';
const VALID_STATUSES  = [200, 301, 302];
const RETRY_WAIT_S    = 15;

function checkHubApi() {
  const res = http.get(`${HUB_API_URL}/2026-04/auth/login`, { timeout: '30s' });
  console.log(`Hub API status: ${res.status}`);

  if (!VALID_STATUSES.includes(res.status) && res.status !== 422) {
    console.warn(`Hub API returned ${res.status}, retrying after ${RETRY_WAIT_S}s...`);
    sleep(RETRY_WAIT_S);
    const retry = http.get(`${HUB_API_URL}/2026-04/auth/login`, { timeout: '30s' });
    console.log(`Hub API (retry): ${retry.status}`);
  }
}

function checkCheckoutApi() {
  const res = http.get(CHECKOUT_API_URL, { timeout: '30s' });
  console.log(`Checkout API status: ${res.status}`);

  if (!VALID_STATUSES.includes(res.status)) {
    console.warn(`Checkout API returned ${res.status}, retrying after ${RETRY_WAIT_S}s...`);
    sleep(RETRY_WAIT_S);
    const retry = http.get(CHECKOUT_API_URL, { timeout: '30s' });
    console.log(`Checkout API (retry): ${retry.status}`);
  }
}

/**
 * Ping both APIs to wake up Heroku dynos before load starts.
 * Call inside setup() so it runs once before any VU starts.
 */
export function wakeUpServers() {
  console.log('========== API Health Check — Waking up servers ==========');
  checkHubApi();
  checkCheckoutApi();
  console.log('All APIs pinged — servers are awake');
}
