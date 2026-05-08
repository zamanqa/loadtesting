/**
 * Centralized API client for the Unified Customer API (2026-04).
 *
 * Auth: JWT Bearer token via POST /auth/login with consumer_key + consumer_secret.
 * Token is cached in Cypress.env() and reused until it expires (decoded from JWT exp claim).
 * On expiry, login is called automatically before the next request.
 *
 * URL patterns:
 *   circulydb  → {baseUrl}/{apiVersion}/{companyId}/circulydb{endpoint}
 *   css        → {baseUrl}/{apiVersion}{endpoint}  (endpoint starts with /css/)
 *   debtist    → {baseUrl}/{apiVersion}/{companyId}{endpoint}  (endpoint starts with /debtist/)
 */

function getBaseUrl() {
  return Cypress.env('apiBaseUrl');
}

function getApiVersion() {
  return Cypress.env('apiVersion');
}

export function getCompanyId() {
  return Cypress.env('companyId');
}

// Decode JWT payload and return expiry timestamp in ms (no external library needed).
function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000;
  } catch {
    // Fallback: treat token as valid for 1 hour
    return Date.now() + 60 * 60 * 1000;
  }
}

function isTokenValid() {
  const token = Cypress.env('jwtToken');
  const expiry = Cypress.env('jwtTokenExpiry');
  return !!(token && expiry && Date.now() < expiry);
}

/**
 * Ensures a valid JWT token exists. Logs in if missing or expired.
 * Sets Cypress.env('jwtToken'), 'jwtTokenExpiry', and 'companyId').
 * Returns a Cypress chainable that resolves to the token string.
 */
export function ensureAuthenticated() {
  if (isTokenValid()) {
    return cy.wrap(Cypress.env('jwtToken'));
  }

  cy.log('JWT token missing or expired — logging in...');
  return cy.request({
    method: 'POST',
    url: `${getBaseUrl()}/${getApiVersion()}/auth/login`,
    body: {
      consumer_key: Cypress.env('consumerKey'),
      consumer_secret: Cypress.env('consumerSecret'),
    },
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    failOnStatusCode: true,
  }).then((res) => {
    const token = res.body.token;
    const companyId = res.body.company_id;

    Cypress.env('jwtToken', token);
    Cypress.env('jwtTokenExpiry', getTokenExpiry(token));
    Cypress.env('companyId', companyId);

    return cy.wrap(token);
  });
}

function bearerHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

/**
 * Request helper for /circulydb/ endpoints (the majority).
 * URL: {baseUrl}/{apiVersion}/{companyId}/circulydb{endpoint}
 */
export function circulydbRequest(method, endpoint, options = {}) {
  return ensureAuthenticated().then((token) => {
    const { headers: extraHeaders, ...rest } = options;
    return cy.request({
      method,
      url: `${getBaseUrl()}/${getApiVersion()}/${getCompanyId()}/circulydb${endpoint}`,
      headers: bearerHeaders(token, extraHeaders),
      ...rest,
    });
  });
}

/**
 * Request helper for /css/ endpoints.
 * URL: {baseUrl}/{apiVersion}{endpoint}  (endpoint starts with /css/)
 */
export function cssRequest(method, endpoint, options = {}) {
  return ensureAuthenticated().then((token) => {
    const { headers: extraHeaders, ...rest } = options;
    return cy.request({
      method,
      url: `${getBaseUrl()}/${getApiVersion()}${endpoint}`,
      headers: bearerHeaders(token, extraHeaders),
      ...rest,
    });
  });
}

/**
 * Request helper for /debtist/ endpoints.
 * URL: {baseUrl}/{apiVersion}/{companyId}{endpoint}  (endpoint includes /debtist/)
 */
export function debtistRequest(method, endpoint, options = {}) {
  return ensureAuthenticated().then((token) => {
    const { headers: extraHeaders, ...rest } = options;
    return cy.request({
      method,
      url: `${getBaseUrl()}/${getApiVersion()}/${getCompanyId()}${endpoint}`,
      headers: bearerHeaders(token, extraHeaders),
      ...rest,
    });
  });
}
