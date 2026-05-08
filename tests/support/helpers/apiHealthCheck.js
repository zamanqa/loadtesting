/**
 * API Health Check — Server Wake-up Helper
 *
 * Call wakeUpServers() inside setup() to warm up the API before
 * VUs start sending load. Required for Cloud Run — instances scale
 * to zero when idle and return 404 until fully started.
 */

import http        from 'k6/http';
import { sleep }   from 'k6';

const BASE_URL     = __ENV.BASE_URL;
const API_VERSION  = __ENV.API_VERSION || '2026-04';
const RETRY_WAIT_S = 15;

function pingApi() {
  const url = `${BASE_URL}/${API_VERSION}/auth/login`;
  const res  = http.get(url, { timeout: '30s' });
  console.log(`[health] API ping: ${res.status} — ${url}`);

  // 200/301/302 = warm, 422 = warm but needs POST body (expected for GET to login)
  const warm = [200, 301, 302, 422].includes(res.status);
  if (!warm) {
    console.warn(`[health] API returned ${res.status} — waiting ${RETRY_WAIT_S}s then retrying`);
    sleep(RETRY_WAIT_S);
    const retry = http.get(url, { timeout: '30s' });
    console.log(`[health] API ping (retry): ${retry.status}`);
  }
}

/**
 * Ping the API to wake up the Cloud Run instance before load starts.
 * Call inside setup() so it runs once before any VU starts.
 */
export function wakeUpServers() {
  console.log('[health] Waking up API server…');
  pingApi();
  console.log('[health] API is awake — proceeding');
}
