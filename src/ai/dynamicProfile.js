export function chooseDynamicProfile({ state = {}, situation = {}, config = {} }) {
  const settings = config.dynamicProfile || {};
  if (settings.enabled === false) return { id: config.profile || "balanced", reason: "disabled" };
  const hpRatio = state.player?.maxHp ? (state.player.hp || 0) / state.player.maxHp : 1;
  if (hpRatio <= (settings.criticalHpRatio || 0.38) || situation.survival === "critical" || situation.pressure === "high") {
    return { id: "survivor", reason: "survival_pressure" };
  }
  if ((situation.economy === "poor" || (state.gold || 0) <= (settings.lowGold || 18)) && situation.pressure !== "high" && (state.wave || 1) <= (settings.farmerMaxWave || 8)) {
    return { id: "farmer", reason: "economy_gap" };
  }
  if (situation.phase === "boss" && situation.survival !== "critical" && (situation.damage === "low" || hpRatio >= (settings.aggressiveHpRatio || 0.7))) {
    return { id: "aggressive", reason: "boss_or_damage_window" };
  }
  return { id: config.profile || "balanced", reason: "base" };
}

export function applyDynamicProfile(config = {}, profileId = "") {
  const id = profileId || config.profile || "balanced";
  const profile = config.profiles?.[id];
  if (!profile) return { ...config, runtimeProfile: config.profile || "balanced" };
  return {
    ...config,
    runtimeProfile: id,
    movement: { ...(config.movement || {}), ...(profile.movement || {}) },
    economy: { ...(config.economy || {}), ...(profile.economy || {}) },
    upgrade: { ...(config.upgrade || {}), ...(profile.upgrade || {}) },
  };
}
