import { WORLD_SIZE } from "../constants.js";

export function classifySituation({ state, world, runtime = {}, config = {} }) {
  const p = state.player;
  const settings = config.situation || {};
  if (!p) return defaultSituation();
  const hpRatio = p.maxHp ? p.hp / p.maxHp : 1;
  const projectilePressure = Math.min(1, (world.enemyProjectiles?.length || 0) / Math.max(1, config.movement?.maxNeighbors || 28));
  const nearEnemies = (world.enemies || []).filter((enemy) => !enemy.dead && distance(p, enemy) < 280).length;
  const phase = world.boss ? "boss" : (state.wave || 1) <= (settings.earlyWave || 3) ? "early" : (state.wave || 1) >= (settings.lateWave || 8) ? "late" : "mid";
  const pressure = projectilePressure >= (settings.projectilePressureHigh || 0.45) || nearEnemies >= (settings.surroundedEnemyCount || 8)
    ? "high"
    : projectilePressure > 0.18 || nearEnemies >= 4 ? "medium" : "low";
  const survival = hpRatio <= (settings.criticalHpRatio || 0.35) ? "critical" : hpRatio <= 0.62 || (runtime.recentDamage || 0) > 8 ? "weak" : "stable";
  const economy = (state.gold || 0) < (settings.lowGold || 25) ? "poor" : (state.gold || 0) > 90 ? "rich" : "stable";
  const damage = state.kills < Math.max(6, (state.time || 0) * 0.08) ? "low" : "normal";
  const position = classifyPosition(p);
  const objective = chooseObjective({ phase, pressure, survival, economy, position, state, world });
  return { phase, pressure, survival, economy, damage, position, objective, hpRatio, projectilePressure, nearEnemies };
}

function chooseObjective({ phase, pressure, survival, economy, position, state, world }) {
  if (survival === "critical" || pressure === "high") return "survive";
  if (position === "corner") return "breakout";
  if (phase === "boss" && world.boss) return "boss_kill";
  if (economy === "poor" && (state.waveTimeLeft || 0) <= 12 && pressure === "low") return "shop_prepare";
  return "farm";
}

function classifyPosition(player) {
  const half = WORLD_SIZE / 2;
  const edge = half - 340;
  const corner = half - 420;
  const ax = Math.abs(player.x || 0);
  const ay = Math.abs(player.y || 0);
  if (ax >= corner && ay >= corner) return "corner";
  if (ax >= edge || ay >= edge) return "edge";
  return "center";
}

function defaultSituation() {
  return {
    phase: "early",
    pressure: "low",
    survival: "stable",
    economy: "stable",
    damage: "normal",
    position: "center",
    objective: "farm",
    hpRatio: 1,
    projectilePressure: 0,
    nearEnemies: 0,
  };
}

function distance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}
