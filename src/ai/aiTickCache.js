export function beginAiTick(runtime, config = {}) {
  runtime.tickId = (runtime.tickId || 0) + 1;
  runtime.tickCache = {
    tickId: runtime.tickId,
    riskGridSize: config.performance?.riskCacheGrid || 48,
    risk: new Map(),
    dropClusters: null,
    bossContext: null,
    situation: null,
  };
  return runtime.tickCache;
}

export function getCachedRisk(cache, point, compute) {
  if (!cache || typeof compute !== "function") return compute?.();
  const grid = cache.riskGridSize || 48;
  const key = `${Math.round((point.x || 0) / grid)},${Math.round((point.y || 0) / grid)},${Math.round(point.r || 14)}`;
  if (cache.risk.has(key)) return cache.risk.get(key);
  const value = compute();
  cache.risk.set(key, value);
  return value;
}

export function getCachedDropClusters(cache, compute) {
  if (!cache || typeof compute !== "function") return compute?.() || [];
  if (cache.dropClusters) return cache.dropClusters;
  cache.dropClusters = compute() || [];
  return cache.dropClusters;
}

export function clearAiTickCache(runtime) {
  if (runtime) runtime.tickCache = null;
}
