import { WORLD_SIZE } from "../constants.js";

const DEFAULT_LOOK_AHEAD = 0.85;
const SAMPLE_TIMES = [0, 0.2, 0.45, 0.85];

export function collectThreats(state, world, options = {}) {
  const p = state.player;
  if (!p) return [];
  const queryRadius = options.queryRadius || 620;
  const threats = [];
  for (const b of world.enemyProjectiles || []) {
    if ((b.life ?? 1) <= 0) continue;
    if (distanceSq(p, b) > (queryRadius + (b.r || 0)) ** 2) continue;
    threats.push(normalizeThreat("projectile", b, 1.15));
  }
  for (const h of world.hazards || []) {
    if ((h.life ?? 1) <= 0) continue;
    if (distanceSq(p, h) > (queryRadius + (h.r || 0) + 120) ** 2) continue;
    threats.push(normalizeThreat("hazard", h, hazardWeight(h)));
  }
  for (const e of world.enemies || []) {
    if (e.dead) continue;
    if (distanceSq(p, e) > (queryRadius + (e.r || 0)) ** 2) continue;
    threats.push(normalizeThreat("enemy", e, enemyWeight(e)));
  }
  if (world.boss && !world.boss.dead && !threats.some((t) => t.source === world.boss)) {
    threats.push(normalizeThreat("boss", world.boss, 1.3));
  }
  return threats;
}

export function normalizeThreat(kind, source, weight = 1) {
  const vx = source.vx ?? source.eliteDashVx ?? source.dashVx ?? source.knockbackX ?? 0;
  const vy = source.vy ?? source.eliteDashVy ?? source.dashVy ?? source.knockbackY ?? 0;
  const type = classifyThreat(source, kind);
  return {
    kind: type,
    baseKind: kind,
    source,
    x: source.x || 0,
    y: source.y || 0,
    vx,
    vy,
    r: source.triggerRadius || source.r || 8,
    damage: source.damage || 1,
    life: source.life ?? source.modeTimer ?? 1,
    weight,
    armTime: source.armTime || 0,
    line: source.kind === "storm_laser_net",
    angle: source.angle || 0,
    length: source.length || 0,
    width: source.width || 0,
  };
}

export function classifyThreat(source, kind) {
  if (kind === "projectile") {
    const speed = Math.hypot(source.vx || 0, source.vy || 0);
    if (speed >= 560) return "projectile_fast";
    if ((source.life || 0) > 2.4 || (source.r || 0) >= 12 || source.landTrapOnExpire) return "projectile_slow_field";
    return "projectile";
  }
  if (kind === "hazard") {
    if ((source.armTime || 0) > 0.35) return "hazard_windup";
    return "hazard_armed";
  }
  if (kind === "enemy") {
    const speed = Math.hypot(source.eliteDashVx || source.vx || 0, source.eliteDashVy || source.vy || 0);
    if (speed > 260 || source.mode === "dash" || source.dashing || source.eliteDashTime > 0 || source.dashState) return "enemy_dash";
    return "enemy_contact";
  }
  if (kind === "boss") return "boss_body";
  return kind;
}

export function riskSamplesForThreat(threat, lookAhead = DEFAULT_LOOK_AHEAD) {
  if (threat.kind === "projectile_fast" || threat.kind === "enemy_dash") return [0, 0.12, 0.24, 0.38].filter((t) => t <= lookAhead);
  if (threat.kind === "projectile_slow_field" || threat.kind === "hazard_armed") return [0, 0.25, 0.55, 0.85].filter((t) => t <= lookAhead);
  return SAMPLE_TIMES.filter((t) => t <= lookAhead);
}

export function predictThreatPosition(threat, t) {
  return {
    x: threat.x + (threat.vx || 0) * t,
    y: threat.y + (threat.vy || 0) * t,
  };
}

export function riskAtPoint(point, threats, options = {}) {
  const lookAhead = options.lookAhead || DEFAULT_LOOK_AHEAD;
  let risk = boundaryRisk(point, options);
  for (const threat of threats || []) {
    if (threat.kind === "hazard_armed" || threat.kind === "hazard_windup") {
      risk += hazardRisk(point, threat);
      continue;
    }
    const samples = riskSamplesForThreat(threat, lookAhead).filter((t) => t <= (threat.life ?? lookAhead));
    for (const t of samples.length ? samples : [0]) {
      const pos = predictThreatPosition(threat, t);
      const dx = point.x - pos.x;
      const dy = point.y - pos.y;
      const safeRadius = (point.r || 14) + (threat.r || 0) + threatPadding(threat);
      const d = Math.max(1, Math.hypot(dx, dy));
      const severity = (threat.damage || 1) * (threat.weight || 1);
      if (d < safeRadius) risk += severity * (1 + (safeRadius - d) / safeRadius) * 8;
      else risk += severity * Math.max(0, 1 - (d - safeRadius) / 180) * 0.7;
    }
  }
  return risk;
}

export function isPointSafe(point, threats, options = {}) {
  return riskAtPoint(point, threats, options) <= (options.safeRisk ?? 24);
}

export function pathRisk(from, to, threats, options = {}) {
  const samples = options.samples || 8;
  let total = 0;
  let maxRisk = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      r: from.r || to.r || 14,
    };
    const risk = riskAtPoint(point, threats, options);
    total += risk;
    maxRisk = Math.max(maxRisk, risk);
  }
  return maxRisk * 0.72 + total / (samples + 1) * 0.28;
}

export function createRiskCache(threats) {
  return { threats, points: new Map() };
}

export function cachedRiskAtPoint(cache, point, options = {}) {
  const key = `${Math.round(point.x / 8)},${Math.round(point.y / 8)},${Math.round(point.r || 14)}`;
  if (cache.points.has(key)) return cache.points.get(key);
  const risk = riskAtPoint(point, cache.threats, options);
  cache.points.set(key, risk);
  return risk;
}

export function boundaryRisk(point, options = {}) {
  const half = WORLD_SIZE / 2 - 60;
  const padding = options.boundaryPadding || 180;
  const dx = half - Math.abs(point.x || 0);
  const dy = half - Math.abs(point.y || 0);
  let risk = 0;
  if (dx < padding) risk += (padding - dx) * 0.08;
  if (dy < padding) risk += (padding - dy) * 0.08;
  if (dx < padding && dy < padding) risk *= 2;
  if (dx < 0 || dy < 0) risk += 1000;
  return risk;
}

export function surroundScore(player, enemies, options = {}) {
  const radius = options.radius || 260;
  const sectors = options.sectors || 16;
  const occupied = new Set();
  const density = Array.from({ length: sectors }, () => 0);
  for (const e of enemies || []) {
    if (e.dead) continue;
    const dx = (e.x || 0) - player.x;
    const dy = (e.y || 0) - player.y;
    const d = Math.hypot(dx, dy);
    if (d > radius + (e.r || 0)) continue;
    const index = Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * sectors) % sectors;
    occupied.add(index);
    density[index] += Math.max(1, radius - d);
  }
  let bestSector = 0;
  let bestDensity = Infinity;
  for (let i = 0; i < density.length; i++) {
    if (density[i] < bestDensity) {
      bestDensity = density[i];
      bestSector = i;
    }
  }
  return { occupied: occupied.size, sectors, surrounded: occupied.size >= Math.ceil(sectors * 0.62), bestSector, density };
}

function hazardRisk(point, threat) {
  if (threat.armTime > 0.45) return 0;
  if (threat.line) return lineRisk(point, threat);
  const dx = point.x - threat.x;
  const dy = point.y - threat.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const safeRadius = (point.r || 14) + threat.r + 24;
  const severity = (threat.damage || 1) * (threat.weight || 1);
  if (d < safeRadius) return severity * (1 + (safeRadius - d) / safeRadius) * 9;
  return severity * Math.max(0, 1 - (d - safeRadius) / 150);
}

function lineRisk(point, threat) {
  const vx = Math.cos(threat.angle);
  const vy = Math.sin(threat.angle);
  const dx = point.x - threat.x;
  const dy = point.y - threat.y;
  const forward = dx * vx + dy * vy;
  const half = (threat.length || 1200) / 2;
  if (forward < -half || forward > half) return 0;
  const side = Math.abs(dx * -vy + dy * vx);
  const safe = (point.r || 14) + (threat.width || 18) + 14;
  return side < safe ? (threat.damage || 1) * 12 : 0;
}

function threatPadding(threat) {
  if (threat.kind === "projectile_fast") return 34;
  if (threat.kind === "projectile_slow_field") return 42;
  if (threat.kind === "projectile") return 22;
  if (threat.kind === "enemy_dash") return 64;
  if (threat.kind === "boss_body") return 90;
  return 38;
}

function hazardWeight(h) {
  if (h.kind === "toxic_residue" || h.kind === "frost_zone") return 1.35;
  if (h.kind === "storm_laser_net") return 1.8;
  return 1.15;
}

function enemyWeight(e) {
  const fast = Math.hypot(e.eliteDashVx || e.vx || 0, e.eliteDashVy || e.vy || 0) > 260 || e.mode === "dash" || e.dashing || e.eliteDashTime > 0;
  return e.boss ? 1.55 : fast ? 1.65 : 0.85;
}

function distanceSq(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return dx * dx + dy * dy;
}
