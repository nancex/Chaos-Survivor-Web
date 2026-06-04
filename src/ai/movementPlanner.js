import { AI_CONFIG } from "./aiConfig.js";
import { bossContext, bossMovementTarget } from "./bossStrategy.js";
import { solveAvoidanceVelocity } from "./orcaAvoidance.js";
import { collectThreats, pathRisk, riskAtPoint, surroundScore } from "./riskModel.js";

export function planMovement({ state, world, runtime = {}, config = AI_CONFIG }) {
  const p = state.player;
  if (!p) return { velocity: { x: 0, y: 0 }, target: null, risk: 0 };
  const movement = config.movement || AI_CONFIG.movement;
  const threats = collectThreats(state, world, movement);
  const context = movementContext({ state, world, threats, movement });
  const target = chooseTarget({ state, world, threats, context, runtime, movement });
  const desired = desiredVelocityForTarget(p, target);
  const velocity = solveAvoidanceVelocity({
    player: p,
    desired,
    threats,
    options: {
      ...movement,
      orca: config.orca,
      lastVelocity: runtime.lastVelocity,
      breakoutAngle: context.breakoutAngle,
      budgetLevel: runtime.budgetLevel || 0,
    },
  });
  updateStuckState(runtime, p, velocity, context);
  runtime.currentTarget = target;
  runtime.lastVelocity = velocity;
  return { velocity, target, threats, risk: riskAtPoint(p, threats, movement), context };
}

export function movementContext({ state, world, threats, movement }) {
  const p = state.player;
  const nearEnemies = (world.enemies || []).filter((e) => !e.dead && dist(p, e) < 280);
  const surround = surroundScore(p, nearEnemies, { radius: 260, sectors: 16 });
  const projectilePressure = threats.filter((t) => t.baseKind === "projectile" || t.kind?.startsWith("projectile")).length / Math.max(1, movement.maxNeighbors || 28);
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
  if (world.boss) return bossMovementTarget(state, world, threats, bossContext(state, world), state.ai?.training);
  const collect = bestCollectTarget(p, world, threats, movement, state);
  if (collect) return collect;
  const nearest = nearestEnemy(p, world.enemies || []);
  if (nearest) return { kind: "farm", x: p.x - normalize(nearest.x - p.x, nearest.y - p.y).x * 180, y: p.y - normalize(nearest.x - p.x, nearest.y - p.y).y * 180, priority: 35 };
  return { kind: "idle", x: p.x, y: p.y, priority: 0 };
}

function bestCollectTarget(p, world, threats, movement, state) {
  let best = null;
  let bestScore = -Infinity;
  const clusters = clusterDrops(world.gems || [], world.coins || [], 180);
  const limit = movement.budgetLevel >= 2 ? 18 : 42;
  for (const cluster of clusters.slice(0, limit)) {
    const d = dist(p, cluster);
    if (d < (p.magnet || 90) * 0.85) continue;
    if (d > (world.boss ? 520 : 820)) continue;
    const scored = scoreDropCluster(cluster, state, threats, movement);
    if (!scored.safe) continue;
    const score = scored.score;
    if (score > bestScore) {
      bestScore = score;
      best = { kind: "collect", x: cluster.x, y: cluster.y, dropKind: cluster.coinValue > cluster.gemValue ? "coin" : "gem", priority: score };
    }
  }
  return best;
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

export function clusterDrops(gems = [], coins = [], radius = 180) {
  const drops = [
    ...gems.map((g) => ({ x: g.x, y: g.y, value: g.value || 1, type: "gem" })),
    ...coins.map((c) => ({ x: c.x, y: c.y, value: c.value || 1, type: "coin" })),
  ];
  const clusters = [];
  const used = new Set();
  for (let i = 0; i < drops.length; i++) {
    if (used.has(i)) continue;
    const members = [drops[i]];
    used.add(i);
    for (let j = i + 1; j < drops.length; j++) {
      if (used.has(j)) continue;
      if (Math.hypot(drops[j].x - drops[i].x, drops[j].y - drops[i].y) <= radius) {
        members.push(drops[j]);
        used.add(j);
      }
    }
    const totalValue = members.reduce((sum, item) => sum + item.value, 0);
    const gemValue = members.filter((item) => item.type === "gem").reduce((sum, item) => sum + item.value, 0);
    const coinValue = members.filter((item) => item.type === "coin").reduce((sum, item) => sum + item.value, 0);
    clusters.push({
      x: members.reduce((sum, item) => sum + item.x * item.value, 0) / totalValue,
      y: members.reduce((sum, item) => sum + item.y * item.value, 0) / totalValue,
      count: members.length,
      totalValue,
      gemValue,
      coinValue,
    });
  }
  return clusters.sort((a, b) => b.totalValue - a.totalValue);
}

export function scoreDropCluster(cluster, state, threats, movement) {
  const p = state.player;
  const d = dist(p, cluster);
  const xpNeed = Math.max(1, p.xpNeed || 100);
  const xpRatio = Math.min(1, (p.xp || 0) / xpNeed);
  const gemWeight = xpRatio > 0.75 ? 2.1 : 1.1;
  const coinWeight = state.gold < 35 ? 2.2 : 1.2;
  const bossPenalty = state.bossWaveActive ? 0.65 : 1;
  const routeRisk = pathRisk({ x: p.x, y: p.y, r: p.r || 14 }, { x: cluster.x, y: cluster.y, r: p.r || 14 }, threats, { ...movement, samples: movement.samples || 8 });
  const value = cluster.gemValue * gemWeight + cluster.coinValue * coinWeight + cluster.count * 1.5;
  return {
    score: value * 160 / Math.max(90, d) * bossPenalty - routeRisk * 0.55,
    safe: routeRisk < (movement.collectRiskLimit || 32),
    routeRisk,
  };
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
