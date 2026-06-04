import { chooseTrainingLoadout as chooseLoadoutFromTraining } from "./aiState.js";

const UPGRADE_BASE = {
  vital_core: 55,
  regen_cell: 38,
  phase_stride: 50,
  magnet_field: 42,
  damage_matrix: 52,
  overclock: 56,
  scope_lens: 40,
  crit_kernel: 34,
  armor_plate: 38,
  evasion_ghost: 34,
  lucky_cache: 32,
};

export function chooseOpeningLoadout({ training, difficulties, weapons }) {
  return chooseLoadoutFromTraining({ training, difficulties, weapons });
}

export function chooseUpgrade({ player, state, items, context = {}, training }) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items || []) {
    const score = scoreUpgrade({ item, player, state, context, training });
    if (score.score > bestScore) {
      best = { item, ...score };
      bestScore = score.score;
    }
  }
  return best;
}

export function scoreUpgrade({ item, player, state, context = {}, training }) {
  const id = item.id;
  const hpRatio = player.maxHp ? player.hp / player.maxHp : 1;
  const wave = state.wave || 1;
  const adjustments = training?.adjustments || {};
  let score = UPGRADE_BASE[id] ?? 20;
  const reasons = [];

  if (id === "vital_core") {
    score += (1 - hpRatio) * 110 + (context.recentDamage || 0) * 1.3 + (adjustments.survivalBias || 0) * 60;
    reasons.push("hp");
  } else if (id === "regen_cell") {
    score += wave * 1.8 + (1 - hpRatio) * 28 - (player.regen || 0) * 8;
    reasons.push("sustain");
  } else if (id === "phase_stride") {
    score += (context.projectilePressure || 0) * 75 + (context.surrounded ? 35 : 0) + (adjustments.mobilityBias || 0) * 70;
    reasons.push("mobility");
  } else if (id === "magnet_field") {
    score += Math.max(0, 6 - wave) * 4 + (state.gold < 30 ? 18 : 0) + (adjustments.greed || 0) * 60;
    reasons.push("growth");
  } else if (id === "damage_matrix") {
    score += (context.lowDamage ? 32 : 0) + wave * 1.3;
    reasons.push("damage");
  } else if (id === "overclock") {
    score += 18 - (player.attackSpeedBonus || 0) * 40;
    reasons.push("attack_speed");
  } else if (id === "scope_lens") {
    score += (context.bossActive ? 25 : 0) + (context.shortRange ? 20 : 0);
    reasons.push("range");
  } else if (id === "crit_kernel") {
    score += Math.max(0, wave - 4) * 2.4 - (player.critChance || 0) * 35;
    reasons.push("crit");
  } else if (id === "armor_plate") {
    score += (context.recentDamage || 0) * 0.8 + (adjustments.survivalBias || 0) * 50;
    reasons.push("armor");
  } else if (id === "evasion_ghost") {
    score += (context.projectilePressure || 0) * 45 - (hpRatio < 0.55 ? 12 : 0);
    reasons.push("dodge");
  } else if (id === "lucky_cache") {
    score += Math.max(0, 7 - wave) * 3;
    reasons.push("shop");
  }

  return { score, reason: reasons.join(",") || "baseline" };
}

export function shouldRefreshUpgradeChoices({ bestScore, gold, refreshCost, refreshesUsed, reserveGold = 12 }) {
  if (refreshesUsed > 0) return false;
  if (gold < refreshCost + reserveGold) return false;
  return bestScore < 35;
}
