import { input, state, world } from "../state.js";
import { difficultyCards } from "../difficulty.js";
import { AI_CONFIG, AI_STORAGE_ENABLED_KEY, readAiEnabled } from "./aiConfig.js";
import { createAiRuntime, loadAiTraining, saveAiTraining, recordRunResult, recordShopAction, recordUpgrade } from "./aiState.js";
import { planMovement } from "./movementPlanner.js";
import { chooseOpeningLoadout, chooseUpgrade, shouldRefreshUpgradeChoices } from "./progressionStrategy.js";
import { decideShopActions } from "./shopStrategy.js";
import { aiLog, markPerf, maybeLogPerf, nowMs } from "./telemetry.js";
import { canFuseWeapons, findFuseCandidate, fuseWeaponSlots } from "../economy/inventory.js";
import { purchaseOffer, refreshCost, refreshShopOffers, shopOffers, toggleOfferLock } from "../economy/shop.js";
import { closeShop, renderShop } from "../ui/shopUi.js";

let config = { ...AI_CONFIG, movement: { ...AI_CONFIG.movement }, economy: { ...AI_CONFIG.economy } };
let actions = {};
let training = null;

export function initAi(options = {}) {
  actions = options.actions || {};
  config = mergeConfig(config, options.config || {});
  training = loadAiTraining(undefined, config.storageKey);
  state.ai ||= {};
  state.ai.runtime = createAiRuntime(state.ai.runtime || {});
  state.ai.training = training;
  setAiEnabled(readAiEnabled(), false);
  exposeDebugApi();
}

export function updateAi(dt) {
  const runtime = ensureRuntime();
  if (!runtime.enabled) return;
  runtime.actionCooldown = Math.max(0, runtime.actionCooldown - dt);
  updateDamageMemory(runtime, dt);
  maybeLogPerf(config, runtime);

  if (state.mode !== "playing") {
    clearAiInput();
    handleUiMode(runtime, dt);
    return;
  }

  runtime.tickAccumulator += dt;
  const interval = 1 / Math.max(1, config.tickHz || 20);
  if (runtime.tickAccumulator < interval && runtime.lastVelocity) {
    applyVelocity(runtime.lastVelocity);
    return;
  }
  runtime.tickAccumulator = 0;
  const started = nowMs();
  const plan = planMovement({ state, world, runtime, config });
  markPerf(runtime, "movementPlanMs", started);
  if (plan.target?.kind !== runtime.lastLoggedTarget) {
    runtime.lastLoggedTarget = plan.target?.kind;
    aiLog(config, "target", { kind: plan.target?.kind, risk: plan.risk }, "debug");
  }
  applyVelocity(plan.velocity);
}

export function setAiEnabled(enabled, persist = true) {
  const runtime = ensureRuntime();
  runtime.enabled = Boolean(enabled);
  config.enabled = runtime.enabled;
  if (!runtime.enabled) clearAiInput();
  if (persist) {
    try {
      localStorage.setItem(AI_STORAGE_ENABLED_KEY, runtime.enabled ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }
  aiLog(config, runtime.enabled ? "enabled" : "disabled", {}, "summary");
}

function handleUiMode(runtime, dt) {
  if (runtime.actionCooldown > 0) return;
  if (state.mode === "menu") return chooseAndStartRun(runtime);
  if (state.mode === "choosingWeapon") return chooseAndStartRun(runtime);
  if (state.mode === "leveling") return handleLeveling(runtime);
  if (state.mode === "shop") return handleShop(runtime);
  if (state.mode === "ended") return handleEnded(runtime, dt);
}

function chooseAndStartRun(runtime) {
  if (!config.autoStart) return;
  const options = actions.getLoadoutOptions?.() || {};
  const loadout = chooseOpeningLoadout({
    training,
    difficulties: options.difficulties || difficultyCards(),
    weapons: options.weapons || [],
  });
  if (!loadout.difficulty || !loadout.weapon) return;
  runtime.runRecorded = false;
  runtime.shopRefreshesUsed = 0;
  runtime.upgradeRefreshesUsed = 0;
  runtime.actionCooldown = config.actionCooldown;
  aiLog(config, "start", { difficulty: loadout.difficulty.id, weapon: loadout.weapon.id });
  actions.startWithLoadout?.({ difficulty: loadout.difficulty, weapon: loadout.weapon });
}

function handleLeveling(runtime) {
  const panel = state.ai?.levelPanel;
  if (!panel?.items?.length || typeof panel.pick !== "function") return;
  const context = {
    projectilePressure: Math.min(1, world.enemyProjectiles.length / 32),
    recentDamage: runtime.recentDamage || 0,
    surrounded: runtime.currentTarget?.kind === "breakout",
    bossActive: Boolean(world.boss),
    lowDamage: state.kills < Math.max(8, state.time * 0.1),
    shortRange: mainWeaponRange() < 600,
  };
  const decision = chooseUpgrade({ player: state.player, state, items: panel.items, context, training });
  if (!decision) return;
  if (panel.refresh && shouldRefreshUpgradeChoices({
    bestScore: decision.score,
    gold: state.gold,
    refreshCost: panel.refreshCost || 10,
    refreshesUsed: runtime.upgradeRefreshesUsed || 0,
    reserveGold: config.economy.minRefreshReserve,
  })) {
    runtime.upgradeRefreshesUsed = (runtime.upgradeRefreshesUsed || 0) + 1;
    runtime.actionCooldown = config.actionCooldown;
    aiLog(config, "upgrade_refresh", { cost: panel.refreshCost, reason: "weak_choices" });
    panel.refresh();
    return;
  }
  runtime.actionCooldown = config.actionCooldown;
  recordUpgrade(training, decision.item.id);
  saveAiTraining(training, undefined, config.storageKey);
  aiLog(config, "upgrade_pick", { id: decision.item.id, score: decision.score, reason: decision.reason });
  panel.pick(decision.item.id);
}

function handleShop(runtime) {
  fuseExistingWeapons(runtime);
  const offers = shopOffers();
  const decision = decideShopActions({
    offers,
    player: state.player,
    inventory: state.inventory,
    state,
    refreshCost: refreshCost(),
    refreshesUsed: runtime.shopRefreshesUsed || 0,
    config: config.economy,
  });
  for (const action of decision) {
    if (action.type === "buy") {
      const result = purchaseOffer(action.uid, action.fuseWeaponUid ? { fuseWeaponUid: action.fuseWeaponUid } : {});
      runtime.actionCooldown = config.actionCooldown;
      if (result.ok) {
        recordShopAction(training, `buy:${action.uid}`);
        saveAiTraining(training, undefined, config.storageKey);
        renderShop?.();
        aiLog(config, "shop_buy", { uid: action.uid, score: action.score, reason: action.reason });
        return;
      }
    } else if (action.type === "lock") {
      if (toggleOfferLock(action.uid)) {
        runtime.actionCooldown = config.actionCooldown;
        renderShop?.();
        aiLog(config, "shop_lock", { uid: action.uid, score: action.score, reason: action.reason });
        return;
      }
    } else if (action.type === "refresh") {
      if (refreshShopOffers()) {
        runtime.shopRefreshesUsed = (runtime.shopRefreshesUsed || 0) + 1;
        runtime.actionCooldown = config.actionCooldown;
        renderShop?.();
        aiLog(config, "shop_refresh", { cost: action.cost, reason: action.reason });
        return;
      }
    } else if (action.type === "continue") {
      runtime.actionCooldown = config.actionCooldown;
      runtime.shopRefreshesUsed = 0;
      aiLog(config, "shop_continue", { gold: state.gold, wave: state.wave });
      closeShop();
      actions.continueToNextWave?.();
      return;
    }
  }
}

function handleEnded(runtime, dt) {
  if (!runtime.runRecorded) {
    runtime.runRecorded = true;
    training = recordRunResult(training, {
      victory: state.victory,
      time: state.time,
      kills: state.kills,
      gold: state.gold,
      level: state.player?.level,
      weaponId: state.initialWeaponId,
      difficultyId: state.difficultyId,
      stuckEvents: runtime.stuckEvents,
    });
    state.ai.training = training;
    saveAiTraining(training, undefined, config.storageKey);
    aiLog(config, "run_summary", { runs: training.totalRuns, victory: state.victory, time: state.time, kills: state.kills, gold: state.gold }, "summary");
    runtime.restartTimer = config.restartDelay;
  }
  if (!config.autoRestart || training.totalRuns >= config.maxTrainingRuns) return;
  runtime.restartTimer = Math.max(0, (runtime.restartTimer ?? config.restartDelay) - dt);
  if (runtime.restartTimer <= 0) {
    chooseAndStartRun(runtime);
  }
}

function fuseExistingWeapons(runtime) {
  for (const slot of state.inventory?.weaponSlots || []) {
    const material = findFuseCandidate(slot);
    if (material && canFuseWeapons(slot, material).ok && fuseWeaponSlots(slot.uid, material.uid)) {
      runtime.actionCooldown = config.actionCooldown;
      aiLog(config, "shop_fuse", { weapon: slot.id, quality: slot.quality });
      renderShop?.();
      return true;
    }
  }
  return false;
}

function applyVelocity(velocity) {
  const p = state.player;
  if (!p) return;
  input.up = false;
  input.down = false;
  input.left = false;
  input.right = false;
  const speed = Math.max(1, p.speed || 200);
  input.vx = clamp((velocity.x || 0) / speed, -1, 1);
  input.vy = clamp((velocity.y || 0) / speed, -1, 1);
}

function clearAiInput() {
  input.vx = 0;
  input.vy = 0;
}

function updateDamageMemory(runtime, dt) {
  const p = state.player;
  if (!p) return;
  if (runtime.lastHp == null) runtime.lastHp = p.hp;
  if (p.hp < runtime.lastHp) runtime.recentDamage = (runtime.recentDamage || 0) + (runtime.lastHp - p.hp);
  runtime.recentDamage = Math.max(0, (runtime.recentDamage || 0) - dt * 4);
  runtime.lastHp = p.hp;
}

function mainWeaponRange() {
  let best = 0;
  for (const weapon of Object.values(state.weapons || {})) {
    if ((weapon.level || 0) > 0) best = Math.max(best, weapon.range || weapon.attackRange || weapon.acquireRange || 0);
  }
  return best + (state.player?.attackRangeBonus || 0);
}

function ensureRuntime() {
  state.ai ||= {};
  state.ai.runtime ||= createAiRuntime();
  return state.ai.runtime;
}

function exposeDebugApi() {
  globalThis.survivorAi = {
    enable: () => setAiEnabled(true),
    disable: () => setAiEnabled(false),
    status: () => ({ enabled: ensureRuntime().enabled, mode: state.mode, target: ensureRuntime().currentTarget, training }),
    configure: (patch) => {
      config = mergeConfig(config, patch || {});
      return globalThis.survivorAi.status();
    },
  };
}

function mergeConfig(base, patch) {
  return {
    ...base,
    ...patch,
    movement: { ...(base.movement || {}), ...(patch.movement || {}) },
    economy: { ...(base.economy || {}), ...(patch.economy || {}) },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
