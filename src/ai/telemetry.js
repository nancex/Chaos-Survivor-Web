const LEVELS = {
  silent: 0,
  summary: 1,
  decision: 2,
  debug: 3,
};

let lastPerfLog = 0;

export function shouldLog(config, level = "decision") {
  const current = LEVELS[config?.logLevel || "decision"] ?? LEVELS.decision;
  return current >= (LEVELS[level] ?? LEVELS.decision);
}

export function aiLog(config, event, payload = {}, level = "decision") {
  if (!shouldLog(config, level)) return;
  const details = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  console.log(`[AI] ${event}${details ? ` ${details}` : ""}`);
}

export function markPerf(runtime, key, startedAt) {
  if (!runtime || !startedAt) return 0;
  const elapsed = nowMs() - startedAt;
  runtime.perf ||= {};
  const stat = runtime.perf[key] || { total: 0, count: 0, max: 0 };
  stat.total += elapsed;
  stat.count += 1;
  stat.max = Math.max(stat.max, elapsed);
  runtime.perf[key] = stat;
  return elapsed;
}

export function maybeLogPerf(config, runtime, intervalMs = 5000) {
  if (!runtime?.perf || !shouldLog(config, "debug")) return;
  const t = nowMs();
  if (t - lastPerfLog < intervalMs) return;
  lastPerfLog = t;
  const payload = {};
  for (const [key, stat] of Object.entries(runtime.perf)) {
    payload[key] = `${(stat.total / Math.max(1, stat.count)).toFixed(2)}ms/${stat.max.toFixed(2)}ms`;
  }
  aiLog(config, "perf", payload, "debug");
}

export function nowMs() {
  if (globalThis.performance?.now) return globalThis.performance.now();
  return Date.now();
}

function formatValue(value) {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\s+/g, "_");
}
