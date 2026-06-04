const BOSS_RANGES = {
  ice: { min: 520, max: 760, ideal: 640 },
  missile: { min: 620, max: 900, ideal: 760 },
  prism_railgun: { min: 650, max: 980, ideal: 820 },
  void_singularity: { min: 480, max: 760, ideal: 620 },
  tesla_mine_chain: { min: 420, max: 680, ideal: 540 },
  echo_tuning_fork: { min: 300, max: 520, ideal: 410 },
  rift_loom: { min: 480, max: 760, ideal: 620 },
  arc: { min: 500, max: 760, ideal: 640 },
  boomerang: { min: 520, max: 820, ideal: 680 },
  drone: { min: 420, max: 650, ideal: 540 },
  starfall_scepter: { min: 700, max: 1040, ideal: 860 },
  phase_needler: { min: 480, max: 760, ideal: 620 },
};

export function bossContext(state, world) {
  const boss = world.boss;
  const p = state.player;
  if (!boss || !p) return { active: false };
  const distance = Math.hypot(boss.x - p.x, boss.y - p.y);
  const mode = boss.mode || boss.currentAttack || boss.dashState || "";
  const dashLike = mode.includes("dash") || boss.dashing || boss.eliteDashTime > 0 || boss.portalState === "burst";
  const laserLike = mode.includes("laser") || mode.includes("rail") || boss.currentAttack === "fan";
  const recoveryLike = mode.includes("recover") || mode.includes("summon") || mode === "intro";
  return {
    active: true,
    boss,
    distance,
    mode,
    dashLike,
    laserLike,
    recoveryLike,
    lowHp: boss.maxHp ? boss.hp / boss.maxHp < 0.2 : false,
  };
}

export function bestBossRange(state) {
  let bestId = null;
  let bestScore = -Infinity;
  for (const [id, weapon] of Object.entries(state.weapons || {})) {
    if ((weapon.level || 0) <= 0) continue;
    const score = (weapon.level || 0) * (weapon.qualityMult || 1) * (weapon.damage || weapon.bulletDamage || weapon.explodeDamage || 40);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  const range = { ...(BOSS_RANGES[bestId] || { min: 500, max: 760, ideal: 640 }) };
  const bonus = state.player?.attackRangeBonus || 0;
  range.min += bonus * 0.35;
  range.max += bonus * 0.55;
  range.ideal += bonus * 0.45;
  range.weaponId = bestId;
  return range;
}

export function bossMovementTarget(state, world, threats, context = bossContext(state, world), training = null) {
  const boss = context.boss || world.boss;
  const p = state.player;
  if (!boss || !p) return null;
  const range = bestBossRange(state);
  const dx = boss.x - p.x;
  const dy = boss.y - p.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / d;
  const ny = dy / d;
  const side = sideSign(state, world, context);
  const aggression = bossAggressionScore(training, state, boss);

  let radial = 0;
  if (context.dashLike || d < range.min) radial = -1;
  else if (d > range.max) radial = 1;
  else if (context.recoveryLike || context.lowHp) radial = aggression > 0.62 ? 0.35 : 0.1;

  const strafe = context.laserLike || context.dashLike ? 260 : 180;
  return {
    kind: "boss_kite",
    weaponId: range.weaponId,
    range,
    x: p.x + nx * radial * 280 + -ny * side * strafe,
    y: p.y + ny * radial * 280 + nx * side * strafe,
    priority: 88,
    reason: context.dashLike ? "dash_evade" : d > range.max ? "approach" : d < range.min ? "separate" : "strafe",
  };
}

export function bossAggressionScore(training, state, boss) {
  let score = 0.5;
  const adjustments = training?.adjustments || {};
  score += adjustments.bossAggression || 0;
  if (boss?.maxHp && boss.hp / boss.maxHp < 0.2) score += 0.12;
  if ((state.player?.hp || 0) < (state.player?.maxHp || 1) * 0.35) score -= 0.18;
  return Math.max(0.15, Math.min(0.85, score));
}

function sideSign(state, world, context) {
  const base = state.time % 7 < 3.5 ? 1 : -1;
  const p = state.player;
  if (!p) return base;
  const half = 2400 - 260;
  if (Math.abs(p.x) > half) return p.x > 0 ? -1 : 1;
  if (Math.abs(p.y) > half) return p.y > 0 ? 1 : -1;
  return context.laserLike ? -base : base;
}
