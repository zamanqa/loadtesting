/**
 * Shared report utilities for k6 handleSummary functions.
 * Import these in any load test file that generates an HTML report.
 */

/** Formats a millisecond value for display, e.g. 423 ms */
export function ms(val) {
  return val != null ? `${Math.round(val)} ms` : '—';
}

/** Formats a rate (0–1) as a percentage string, e.g. 0.5% */
export function pct(val) {
  return val != null ? `${(val * 100).toFixed(1)}%` : '—';
}

/** Returns the values object for a named metric, or null if not found */
export function getMetric(data, key) {
  return data.metrics[key] ? data.metrics[key].values : null;
}

/** Returns true if the threshold passed, false if it failed, null if not defined */
export function passed(data, key) {
  const t = data.thresholds && data.thresholds[key];
  return t ? t.ok !== false : null;
}
