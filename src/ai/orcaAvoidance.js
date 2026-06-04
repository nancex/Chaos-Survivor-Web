import { riskAtPoint } from "./riskModel.js";

export function solveAvoidanceVelocity({ player, desired, threats, options = {} }) {
  const maxSpeed = player.speed || 200;
  const desiredVelocity = limitVector(desired || { x: 0, y: 0 }, maxSpeed);
  const neighbors = selectNeighbors(player, threats || [], options.maxNeighbors || 28);
  if (!neighbors.length) return desiredVelocity;

  const candidates = candidateVelocities(desiredVelocity, maxSpeed, options.candidateDirections || 32);
  let best = desiredVelocity;
  let bestCost = Infinity;
  for (const velocity of candidates) {
    const future = {
      x: player.x + velocity.x * (options.lookAhead || 0.85),
      y: player.y + velocity.y * (options.lookAhead || 0.85),
      r: player.r || 14,
    };
    const risk = riskAtPoint(future, neighbors, options);
    const constraint = velocityConstraintCost(player, velocity, neighbors, options);
    const desire = Math.hypot(velocity.x - desiredVelocity.x, velocity.y - desiredVelocity.y) * 0.035;
    const stopPenalty = Math.hypot(velocity.x, velocity.y) < maxSpeed * 0.15 ? 4 : 0;
    const cost = risk + constraint + desire + stopPenalty;
    if (cost < bestCost) {
      best = velocity;
      bestCost = cost;
    }
  }
  return best;
}

export function buildVelocityConstraints(player, threats, options = {}) {
  return selectNeighbors(player, threats || [], options.maxNeighbors || 28).map((threat) => {
    const relX = threat.x - player.x;
    const relY = threat.y - player.y;
    const d = Math.max(1, Math.hypot(relX, relY));
    return {
      point: { x: threat.vx || 0, y: threat.vy || 0 },
      normal: { x: -relX / d, y: -relY / d },
      weight: threat.weight || 1,
      ttl: threat.life ?? 1,
      sourceKind: threat.kind,
    };
  });
}

function velocityConstraintCost(player, velocity, threats, options) {
  let cost = 0;
  const horizon = options.lookAhead || 0.85;
  for (const threat of threats) {
    const relX = threat.x - player.x;
    const relY = threat.y - player.y;
    const relVx = (threat.vx || 0) - velocity.x;
    const relVy = (threat.vy || 0) - velocity.y;
    const relSpeedSq = relVx * relVx + relVy * relVy;
    if (relSpeedSq < 0.001) continue;
    const t = clamp(-((relX * relVx + relY * relVy) / relSpeedSq), 0, Math.min(horizon, threat.life ?? horizon));
    const cx = relX + relVx * t;
    const cy = relY + relVy * t;
    const safe = (player.r || 14) + (threat.r || 8) + (threat.kind === "projectile" ? 24 : 42);
    const d = Math.hypot(cx, cy);
    if (d < safe) cost += (safe - d) / safe * (threat.damage || 1) * (threat.weight || 1) * 12;
  }
  return cost;
}

function selectNeighbors(player, threats, maxNeighbors) {
  return [...threats]
    .map((threat) => {
      const dx = threat.x - player.x;
      const dy = threat.y - player.y;
      const dist = Math.hypot(dx, dy);
      const movingAway = (threat.vx || 0) * dx + (threat.vy || 0) * dy > 0;
      const score = (threat.damage || 1) * (threat.weight || 1) / Math.max(60, dist) * (movingAway ? 0.45 : 1);
      return { threat, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNeighbors)
    .map((entry) => entry.threat);
}

function candidateVelocities(desired, maxSpeed, directions) {
  const candidates = [desired, { x: 0, y: 0 }];
  const baseAngle = Math.atan2(desired.y, desired.x);
  const hasDesired = Math.hypot(desired.x, desired.y) > 1;
  const speeds = [maxSpeed, maxSpeed * 0.72, maxSpeed * 0.42];
  for (const speed of speeds) {
    for (let i = 0; i < directions; i++) {
      const offset = (i / directions) * Math.PI * 2;
      const a = hasDesired ? baseAngle + offset : offset;
      candidates.push({ x: Math.cos(a) * speed, y: Math.sin(a) * speed });
    }
  }
  if (hasDesired) candidates.push({ x: -desired.x * 0.85, y: -desired.y * 0.85 });
  return candidates;
}

function limitVector(v, max) {
  const len = Math.hypot(v.x || 0, v.y || 0);
  if (len <= max || len < 0.001) return { x: v.x || 0, y: v.y || 0 };
  return { x: v.x / len * max, y: v.y / len * max };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
