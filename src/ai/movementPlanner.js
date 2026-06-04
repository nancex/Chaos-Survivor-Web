import { AI_CONFIG } from "./aiConfig.js";
import { solveAvoidanceVelocity } from "./orcaAvoidance.js";
import { collectThreats, isPointSafe, riskAtPoint, surroundScore } from "./riskModel.js";

export function planMovement({ state, world, runtime = {}, config = AI_CONFIG }) {
  const p = state.player;
  if (!p) return { velocity: { x: 0, y: 0 }, target: null, risk: 0 };
  const movement = config.movement || AI_CONFIG.movement;
  const threats = collectThreats(state, world, movement);
  const context = movementContext({ state, world, threats, movement });
  const target = chooseTarget({ state, world, threats, context, runtime, movement });
  const desired = desiredVelocityForTarget(p, target);
  const velocity = solveAvoidanceVelocity({ player: p, desired, threats, options: movement });
  updateStuckState(runtime, p, velocity, context);
  runtime.currentTarget = target;
  runtime.lastVelocity = velocity;
  return { velocity, target, risk: riskAtPoint(p, threats, movement), context };
}

export function movementContext({ state, world, threats, movement }) {
  const p = state.player;
  const nearEnemies = (world.enemies || []).filter((e) => !e.dead && dist(p, e) < 280);
  const surround = surroundScore(p, nearEnemies, { radius: 260, sectors: 16 });
  const projectilePressure = threats.filter((t) => t.kind === "projectile").length / Math.max(1, movement.maxNeighbors || 28);
  return {
    surrounded: surround.surrounded,
    breakoutAngle: (surround.bestSector / surround.sectors) * Math.PI * 2,
    projectilePressure,
    lowHp: p.hp < p.maxHp * 0.38,
    bossActive: Boolean(world.boss),
  };
}

function chooseTarget({ state, world, threats, context, runtime, movement }) {
  const p = state.player;
  if (runtime.stuckTimer > (movement.stuckSeconds || 1.2) || context.surrounded) {
    return { kind: "breakout", x: p.x + Math.cos(context.breakoutAngle) * 260, y: p.y + Math.sin(context.breakoutAngle) * 260, priority: 100 };
  }
  if (context.lowHp || context.projectilePressure > 0.42) {
    return safestNearbyPoint(p, threats, movement);
  }
  if (world.boss) return bossKiteTarget(state, world.boss);
  const collect = bestCollectTarget(p, world, threats, movement, state);
  if (collect) return collect;
  const nearest = nearestEnemy(p, world.enemies || []);
  if (nearest) return { kind: "farm", x: p.x - normalize(nearest.x - p.x, nearest.y - p.y).x * 180, y: p.y - normalize(nearest.x - p.x, nearest.y - p.y).y * 180, priority: 35 };
  return { kind: "idle", x: p.x, y: p.y, priority: 0 };
}

function bestCollectTarget(p, world, threats, movement, state) {
  let best = null;
  let bestScore = -Infinity;
  const drops = [
    ...(world.gems || []).map((g) => ({ ...g, kind: "gem", value: g.value || 1 })),
    ...(world.coins || []).map((c) => ({ ...c, kind: "coin", value: (c.value || 1) * (state.gold < 30 ? 2.2 : 1.3) })),
  ];
  for (const drop of drops) {
    const d = dist(p, drop);
    if (d > 760) continue;
    const routeSafe = routeIsSafe(p, drop, threats, movement);
    if (!routeSafe) continue;
    const score = (drop.value || 1) * 120 / Math.max(80, d);
    if (score > bestScore) {
      bestScore = score;
      best = { kind: "collect", x: drop.x, y: drop.y, dropKind: drop.kind, priority: score };
    }
  }
  return best;
}

function routeIsSafe(p, target, threats, movement) {
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const point = { x: p.x + (target.x - p.x) * t, y: p.y + (target.y - p.y) * t, r: p.r || 14 };
    if (!isPointSafe(point, threats, { ...movement, safeRisk: 26 })) return false;
  }
  return true;
}

function bossKiteTarget(state, boss) {
  const p = state.player;
  const range = mainWeaponRange(state);
  const desired = Math.max(360, Math.min(760, range * 0.72));
  const dx = boss.x - p.x;
  const dy = boss.y - p.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / d;
  const ny = dy / d;
  const side = state.time % 6 < 3 ? 1 : -1;
  let toward = 0;
  if (d > desired + 90) toward = 1;
  else if (d < desired - 80) toward = -1;
  return {
    kind: "kite",
    x: p.x + nx * toward * 240 + -ny * side * 180,
    y: p.y + ny * toward * 240 + nx * side * 180,
    priority: 80,
  };
}

function safestNearbyPoint(p, threats, movement) {
  let best = { kind: "survive", x: p.x, y: p.y, priority: 90 };
  let bestRisk = riskAtPoint(p, threats, movement);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const point = { x: p.x + Math.cos(a) * 220, y: p.y + Math.sin(a) * 220, r: p.r || 14 };
    const risk = riskAtPoint(point, threats, movement);
    if (risk < bestRisk) {
      bestRisk = risk;
      best = { kind: "survive", x: point.x, y: point.y, priority: 90 };
    }
  }
  return best;
}

function desiredVelocityForTarget(p, target) {
  if (!target) return { x: 0, y: 0 };
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 8) return { x: 0, y: 0 };
  return { x: dx / d * (p.speed || 200), y: dy / d * (p.speed || 200) };
}

function updateStuckState(runtime, p, velocity, context) {
  const last = runtime.lastPosition;
  if (last) {
    const moved = Math.hypot(p.x - last.x, p.y - last.y);
    const trying = Math.hypot(velocity.x, velocity.y) > 60;
    runtime.stuckTimer = trying && moved < 2 ? (runtime.stuckTimer || 0) + 0.05 : Math.max(0, (runtime.stuckTimer || 0) - 0.1);
  }
  if (runtime.stuckTimer > 1.2 && !runtime.wasStuck) {
    runtime.stuckEvents = (runtime.stuckEvents || 0) + 1;
    runtime.wasStuck = true;
  }
  if (!context.surrounded && runtime.stuckTimer < 0.2) runtime.wasStuck = false;
  runtime.lastPosition = { x: p.x, y: p.y };
}

function mainWeaponRange(state) {
  let best = 520;
  for (const weapon of Object.values(state.weapons || {})) {
    if ((weapon.level || 0) <= 0) continue;
    best = Math.max(best, weapon.range || weapon.attackRange || weapon.acquireRange || 520);
  }
  return best + (state.player.attackRangeBonus || 0);
}

function nearestEnemy(p, enemies) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist(p, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function normalize(x, y) {
  const d = Math.max(1, Math.hypot(x, y));
  return { x: x / d, y: y / d };
}

function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}
