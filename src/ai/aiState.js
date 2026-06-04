import { AI_CONFIG } from "./aiConfig.js";

const DEFAULT_WEAPON_WEIGHTS = {
  missile: 1.3,
  ice: 1.22,
  prism_railgun: 1.12,
  void_singularity: 1.06,
  tesla_mine_chain: 1.04,
  rift_loom: 1.02,
  arc: 1,
  boomerang: 0.96,
  drone: 0.94,
  starfall_scepter: 0.94,
  phase_needler: 0.92,
  echo_tuning_fork: 0.78,
};

export function createAiRuntime(overrides = {}) {
  return {
    enabled: false,
    tickAccumulator: 0,
    actionCooldown: 0,
    restartTimer: 0,
    runRecorded: false,
    shopRefreshesUsed: 0,
    upgradeRefreshesUsed: 0,
    currentTarget: null,
    lastVelocity: { x: 0, y: 0 },
    lastPosition: null,
    stuckTimer: 0,
    stuckEvents: 0,
    recentDamage: 0,
    lastHp: null,
    perf: {},
    ...overrides,
  };
}

export function createTrainingState() {
  return {
    totalRuns: 0,
    victories: 0,
    totalTime: 0,
    recentRuns: [],
    weaponStats: {},
    difficultyStats: {},
    upgradeCounts: {},
    shopCounts: {},
    adjustments: {
      survivalBias: 0,
      mobilityBias: 0,
      greed: 0,
      bossAggression: 0,
    },
  };
}

export function loadAiTraining(storage = globalThis.localStorage, key = AI_CONFIG.storageKey) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return createTrainingState();
    return normalizeTraining(JSON.parse(raw));
  } catch {
    return createTrainingState();
  }
}

export function saveAiTraining(training, storage = globalThis.localStorage, key = AI_CONFIG.storageKey) {
  try {
    storage?.setItem(key, JSON.stringify(normalizeTraining(training)));
  } catch {
    // Storage can be unavailable in sandboxed iframes; AI should still run.
  }
}

export function recordRunResult(training, result) {
  const data = normalizeTraining(training);
  const summary = {
    victory: Boolean(result.victory),
    time: Math.max(0, Math.round(result.time || 0)),
    kills: Math.max(0, Math.round(result.kills || 0)),
    gold: Math.max(0, Math.round(result.gold || 0)),
    level: Math.max(1, Math.round(result.level || 1)),
    weaponId: result.weaponId || "unknown",
    difficultyId: result.difficultyId || "unknown",
    deathReason: result.deathReason || inferDeathReason(result),
    at: Date.now(),
  };
  data.totalRuns += 1;
  data.victories += summary.victory ? 1 : 0;
  data.totalTime += summary.time;
  data.recentRuns.push(summary);
  while (data.recentRuns.length > 20) data.recentRuns.shift();
  updateBucket(data.weaponStats, summary.weaponId, summary);
  updateBucket(data.difficultyStats, summary.difficultyId, summary);
  applyAdjustment(data.adjustments, summary);
  Object.assign(training, data);
  return data;
}

export function recordUpgrade(training, id) {
  const data = normalizeTraining(training);
  data.upgradeCounts[id] = (data.upgradeCounts[id] || 0) + 1;
  Object.assign(training, data);
  return data;
}

export function recordShopAction(training, id) {
  const data = normalizeTraining(training);
  data.shopCounts[id] = (data.shopCounts[id] || 0) + 1;
  Object.assign(training, data);
  return data;
}

export function chooseTrainingLoadout({ training, difficulties, weapons }) {
  const unlocked = (difficulties || []).filter((item) => item?.unlocked);
  const difficulty = chooseDifficulty(normalizeTraining(training), unlocked);
  const weapon = chooseWeapon(normalizeTraining(training), weapons || []);
  return { difficulty: difficulty || unlocked[0] || difficulties?.[0] || null, weapon: weapon || weapons?.[0] || null };
}

function chooseDifficulty(training, unlocked) {
  if (!unlocked.length) return null;
  const ordered = [...unlocked].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const recent = training.recentRuns.slice(-5);
  const recentWins = recent.filter((run) => run.victory).length;
  if (recent.length >= 3 && recentWins === 0 && ordered.length > 1) return ordered[Math.max(0, ordered.length - 2)];
  if (recent.length >= 5 && recentWins >= 3) return ordered[ordered.length - 1];
  return ordered[Math.max(0, ordered.length - 1)];
}

function chooseWeapon(training, weapons) {
  let best = null;
  let bestScore = -Infinity;
  for (const weapon of weapons) {
    const id = weapon.id;
    const stats = training.weaponStats[id];
    const prior = DEFAULT_WEAPON_WEIGHTS[id] || 1;
    const winRate = stats?.runs ? stats.wins / stats.runs : 0.45;
    const avgTime = stats?.runs ? stats.time / stats.runs : 90;
    const confidence = stats?.runs ? Math.min(1, stats.runs / 8) : 0;
    const score = prior * 100 + winRate * 70 * confidence + Math.min(90, avgTime) * 0.22;
    if (score > bestScore) {
      best = weapon;
      bestScore = score;
    }
  }
  return best;
}

function updateBucket(collection, key, summary) {
  const bucket = collection[key] || { runs: 0, wins: 0, time: 0, kills: 0, gold: 0 };
  bucket.runs += 1;
  bucket.wins += summary.victory ? 1 : 0;
  bucket.time += summary.time;
  bucket.kills += summary.kills;
  bucket.gold += summary.gold;
  collection[key] = bucket;
}

function inferDeathReason(result) {
  if (result.victory) return "victory";
  if (result.stuckEvents > 0) return "corner_stuck";
  if ((result.kills || 0) < Math.max(5, (result.time || 0) * 0.08)) return "low_damage";
  if ((result.gold || 0) < 15 && (result.time || 0) > 70) return "low_gold";
  return "death_by_pressure";
}

function applyAdjustment(adjustments, summary) {
  if (summary.victory) {
    adjustments.greed = clamp(adjustments.greed + 0.02, -0.35, 0.35);
    adjustments.bossAggression = clamp(adjustments.bossAggression + 0.02, -0.25, 0.35);
    return;
  }
  if (summary.deathReason.includes("projectile") || summary.deathReason.includes("pressure")) adjustments.mobilityBias = clamp(adjustments.mobilityBias + 0.05, -0.2, 0.45);
  if (summary.deathReason.includes("enemy") || summary.deathReason.includes("hazard")) adjustments.survivalBias = clamp(adjustments.survivalBias + 0.05, -0.2, 0.45);
  if (summary.deathReason === "low_gold") adjustments.greed = clamp(adjustments.greed + 0.04, -0.35, 0.35);
  if (summary.deathReason === "low_damage") adjustments.bossAggression = clamp(adjustments.bossAggression + 0.04, -0.25, 0.35);
}

function normalizeTraining(value) {
  return {
    ...createTrainingState(),
    ...(value || {}),
    recentRuns: Array.isArray(value?.recentRuns) ? value.recentRuns.slice(-20) : [],
    weaponStats: { ...(value?.weaponStats || {}) },
    difficultyStats: { ...(value?.difficultyStats || {}) },
    upgradeCounts: { ...(value?.upgradeCounts || {}) },
    shopCounts: { ...(value?.shopCounts || {}) },
    adjustments: { ...createTrainingState().adjustments, ...(value?.adjustments || {}) },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
