import { WORLD_SIZE, TAU } from "../constants.js";
import { state, world } from "../state.js";
import { distSq, clamp } from "../utils.js";
import { burst, particle, pulse, trail } from "../effects.js";
import { playSfx } from "../audio.js";
import { QUALITY_INFO, QUALITY_ORDER, recomputeAllWeapons } from "../economy/inventory.js";
import { recordCodexEntry } from "./codex.js";
import { ITEM_DATA_DEFS, onEditableDataChanged } from "../config/editableGameData.js";

const QUALITY_VALUES = {
  heart_container: [5, 10, 20, 35, 50],
  healing_potion: [20, 30, 50, 80, 120],
  healing_aura: [1, 2, 3, 4, 5],
  airburst: [30, 25, 20, 15, 10],
};

const QUALITY_SCALE = {
  common: 1,
  uncommon: 1.2,
  rare: 1.45,
  epic: 1.8,
  legendary: 2.3,
};

const ITEM_EFFECTS = {
  heart_container: ({ player, quality }) => { const value = qualityValue("heart_container", quality); player.maxHp += value; player.hp = Math.min(player.maxHp, player.hp + value); },
  healing_potion: ({ player, quality }) => { player.hp = Math.min(player.maxHp, player.hp + qualityValue("healing_potion", quality)); },
  shackles: ({ player }) => { player.speed -= 12; player.attackRangeBonus += 80; },
  dodge_cloak: ({ player }) => { player.dodge = clamp(player.dodge + 0.05, 0, 0.7); player.maxHp = Math.max(30, player.maxHp - 20); player.hp = Math.min(player.hp, player.maxHp); },
  bait: ({ player }) => { player.nextWaveSpawnBonus += 0.5; },
  magnet: ({ player }) => { player.magnet += 32; },
  speed_boots: ({ player }) => { player.speed += 18; },
  rapid_cord: ({ player }) => { player.attackSpeedBonus += 0.12; },
  fang: ({ player }) => { player.bleedDps += 7; player.bleedDuration = Math.max(player.bleedDuration, 2.8); },
  split_shot: ({ player }) => applySplitShot(player),
  lucky_clover: ({ player }) => { player.luck += 10; },
  gloves: ({ player }) => { player.critChance = clamp(player.critChance + 0.07, 0, 0.7); },
  knife: ({ player, scale }) => { player.damageScale += 0.08 * scale; },
  healing_aura: ({ player, quality }) => { player.regen += qualityValue("healing_aura", quality); },
  tardigrade: ({ player }) => { player.waveShields += 1; player.currentWaveShields += 1; },
  heavy_armor: ({ player }) => { player.defense += 8; player.speed -= 10; },
  turret: ({ player }) => { player.turretCount += 1; },
  thief_mark: ({ player }) => { player.coinDropBonus += 0.2; player.goldLossOnHit += 0.06; },
  star_cloak: ({ player }) => { player.starCloak = 1; },
  landmine: ({ player }) => { player.landminePacks += 1; },
  airburst: ({ player, quality }) => { player.airburstInterval = qualityValue("airburst", quality); player.airburstTimer = player.airburstInterval; },
  free_coupon: ({ player }) => { player.freeShopPasses += 1; },
  debt_chip: ({ player }) => { player.debtChips += 1; },
  black_market_invite: ({ player }) => { player.blackMarketInvite = 1; },
  copy_film: ({ player }) => { player.copyFilmCharges += 1; },
  escape_smoke_bomb: ({ player }) => { player.escapeSmokeBombs += 1; },
  overcharge_battery: ({ player }) => { player.overchargeBatteries += 1; },
  target_marker: ({ player }) => { player.targetMarkers += 1; },
  decoy_dummy: ({ player }) => { player.decoyDummies += 1; },
  rift_beacon: ({ player }) => { player.riftBeacon = 1; },
  rewind_hourglass: ({ player }) => { player.rewindHourglass = 1; },
  frost_canister: ({ player }) => { player.frostCanisters += 1; },
  counter_coil: ({ player }) => { player.counterCoils += 1; },
  wound_seal: ({ player }) => { player.woundSeals += 1; },
  bounty_contract: ({ player }) => { player.bountyContracts += 1; },
  emergency_gate: ({ player }) => { player.emergencyGate = 1; },
};

export const ITEM_DEFS = [];
syncItemDefs();
onEditableDataChanged(syncItemDefs);

function syncItemDefs() {
  ITEM_DEFS.length = 0;
  ITEM_DEFS.push(...ITEM_DATA_DEFS.map((item) => ({ ...item, apply: ITEM_EFFECTS[item.id] })));
}

export function applyItemPurchase(offer) {
  const item = ITEM_DEFS.find((entry) => entry.id === offer.itemId || entry.id === offer.id);
  if (!item || !state.player) return;
  if (item.unique && hasPurchasedUniqueItem(item.id)) return;
  const quality = offerQualityForItem(item, offer.rarity);
  const scale = qualityScale(quality);
  item.apply?.({ player: state.player, quality, scale });
  if (item.unique) {
    state.player.purchasedUniqueItems ||= {};
    state.player.purchasedUniqueItems[item.id] = true;
  }
  recordItem(item, quality, offer.quantity || 1);
  pulse(state.player.x, state.player.y, 54, QUALITY_INFO[quality]?.color || "#77ff8a", 0.32);
}

export function updateItems(dt) {
  const p = state.player;
  if (!p) return;
  if (p.regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  updateRewindHistory(dt);
  updateTargetMarkers();
  updateBountyTargets();
  updateEmergencyGate();
  p.counterCoilCooldown = Math.max(0, (p.counterCoilCooldown || 0) - dt);
  p.riftBeaconCooldown = Math.max(0, (p.riftBeaconCooldown || 0) - dt);
  updateAirburst(p, dt);
  updateBleeds(dt);
  updateItemObjects(dt);
}

export function startWaveItems() {
  const p = state.player;
  if (!p) return;
  p.currentWaveShields = p.waveShields || 0;
  world.itemObjects.length = 0;
  p.overchargedHits = (p.overchargedHits || 0) + (p.overchargeBatteries || 0);
  p.targetMarkerPending = p.targetMarkers || 0;
  p.bountyPending = p.bountyContracts || 0;
  p.bountyTargets = [];
  p.counterCoilCooldown = 0;
  p.emergencyGateReady = Boolean(p.emergencyGate);
  for (let i = 0; i < (p.turretCount || 0); i++) spawnTurret();
  for (let i = 0; i < (p.landminePacks || 0) * 3; i++) spawnLandmine();
  for (let i = 0; i < (p.decoyDummies || 0); i++) spawnDecoyDummy(i);
  for (let i = 0; i < (p.frostCanisters || 0); i++) spawnFrostCanister();
  if (p.riftBeacon) spawnRiftBeacons();
}

export function applyPlayerDamage(amount, source = {}) {
  const p = state.player;
  if (!p || amount <= 0) return { damaged: false, amount: 0 };
  if (amount < 1) {
    const reducedTick = Math.max(0.05, amount - (p.defense || 0) * 0.016);
    p.hp -= reducedTick;
    if (p.hp <= 0 && triggerLifeSaver(p)) return { damaged: false, amount: 0, saved: true };
    return { damaged: true, amount: reducedTick };
  }
  if (Math.random() < clamp(p.dodge || 0, 0, 0.7)) {
    pulse(p.x, p.y, 44, "#b48cff", 0.22);
    playSfx("select");
    return { damaged: false, dodged: true, amount: 0 };
  }
  if ((p.currentWaveShields || 0) > 0) {
    p.currentWaveShields--;
    pulse(p.x, p.y, 62, "#ffd166", 0.28);
    burst(p.x, p.y, 16, "#ffd166", 180);
    playSfx("select");
    return { damaged: false, shielded: true, amount: 0 };
  }
  const reduced = Math.max(1, amount - (p.defense || 0));
  p.hp -= reduced;
  if (p.woundSeals > 0 && reduced > 0) spawnWoundSeal(p, reduced);
  if ((p.goldLossOnHit || 0) > 0 && state.gold > 0) {
    state.gold = Math.max(0, state.gold - Math.max(1, Math.ceil(state.gold * p.goldLossOnHit)));
  }
  if ((p.starCloak || 0) > 0) triggerStarCloak(source.x ?? p.x, source.y ?? p.y, p.starCloak);
  if (p.hp <= 0 && triggerLifeSaver(p)) return { damaged: false, amount: 0, saved: true };
  return { damaged: true, amount: reduced };
}

export function modifyWeaponDamage(amount, weapon = null) {
  return rollWeaponDamage(amount, weapon).amount;
}

export function rollWeaponDamage(amount, weapon = null) {
  const p = state.player;
  const penalty = Math.min(0.75, weapon?.splitDamagePenalty || p?.splitDamagePenalty || 0);
  const critical = Math.random() < clamp(p?.critChance || 0, 0, 0.7);
  const crit = critical ? 1.85 : 1;
  return { amount: amount * Math.max(0.25, 1 - penalty) * crit, critical };
}

export function weaponRangeBonus() {
  return state.player?.attackRangeBonus || 0;
}

export function attackSpeedMultiplier() {
  return 1 + (state.player?.attackSpeedBonus || 0);
}

export function projectileBonus() {
  return state.player?.projectileBonus || 0;
}

export function weaponProjectileBonus(weapon) {
  return (weapon?.projectileBonus || 0) + projectileBonus();
}

export function onWeaponHit(enemy, x, y) {
  const p = state.player;
  if (!enemy || enemy.dead || !p) return;
  if ((p.bleedDps || 0) > 0) {
    enemy.bleedDps = Math.max(enemy.bleedDps || 0, p.bleedDps);
    enemy.bleedTimer = Math.max(enemy.bleedTimer || 0, p.bleedDuration || 2.8);
    if (Math.random() < 0.3) burst(x, y, 3, "#ff4d6d", 90);
  }
}

export function waveSpawnMultiplier() {
  return 1 + (state.player?.activeWaveSpawnBonus || 0);
}

export function consumeNextWaveSpawnBonus() {
  const p = state.player;
  if (!p) return;
  p.activeWaveSpawnBonus = p.nextWaveSpawnBonus || 0;
  p.nextWaveSpawnBonus = 0;
}

export function coinDropMultiplier() {
  return 1 + (state.player?.coinDropBonus || 0);
}

export function weightedQuality(baseWeights) {
  const luck = Math.max(0, state.player?.luck || 0);
  const entries = baseWeights.map(([quality, weight]) => {
    const rank = qualityRank(quality);
    const luckMul = rank === 0 ? 1 / (1 + luck * 0.012) : 1 + luck * rank * 0.035;
    return [quality, Math.max(0.1, weight * luckMul)];
  });
  return weightedChoice(entries);
}

export function itemSellPriceById(id, quality = "common") {
  const baseId = id?.replace(/_(common|uncommon|rare|epic|legendary)$/, "");
  const item = ITEM_DEFS.find((entry) => entry.id === baseId);
  return Math.max(2, Math.floor((item?.basePrice || 10) * qualityScale(quality) * 0.35));
}

export function itemDescription(item, quality = "common") {
  if (!item) return "";
  if (item.id === "split_shot") return item.desc;
  if (item.id === "heart_container") return `最大生命值 +${qualityValue("heart_container", quality)}。`;
  if (item.id === "healing_potion") return `立即恢复 ${qualityValue("healing_potion", quality)} 点生命。`;
  if (item.id === "healing_aura") return `每秒生命回复 +${qualityValue("healing_aura", quality)}。`;
  if (item.id === "knife") return `攻击伤害 +${Math.round(8 * qualityScale(quality))}%。`;
  if (item.id === "airburst") return `不可叠加。每隔 ${qualityValue("airburst", quality)} 秒清空玩家附近敌方投射物。`;
  return item.desc;
}

export function hasInventoryItem(itemId) {
  return Boolean(state.inventory?.items.some((entry) => entry.itemId === itemId || entry.id === itemId || entry.id?.startsWith(`${itemId}_`)));
}

export function hasPurchasedUniqueItem(itemId) {
  return Boolean(state.player?.purchasedUniqueItems?.[itemId] || hasInventoryItem(itemId));
}

export function canPurchaseItem(itemId) {
  const item = ITEM_DEFS.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, reason: "道具不存在" };
  if (item.unique && hasPurchasedUniqueItem(item.id)) return { ok: false, reason: "该道具只能购买一次" };
  if (item.id === "split_shot" && !state.inventory?.weaponSlots.some((slot) => splitShotWeaponIds().includes(slot.id))) return { ok: false, reason: "需要至少一把投射物武器" };
  return { ok: true };
}

export function offerQualityForItem(item, rarity) {
  if (item?.fixedQuality) return item.fixedQuality;
  return item?.singleQuality ? "common" : rarity || "common";
}

export function maybeTriggerOvercharge(enemy, x, y) {
  const p = state.player;
  if (!p || !enemy || enemy.dead || (p.overchargedHits || 0) <= 0) return;
  p.overchargedHits--;
  const radius = 124;
  for (const e of world.enemies) {
    if (e.dead || distSq(x, y, e.x, e.y) > (radius + e.r) ** 2) continue;
    e.takeDamage?.(46, x, y, { statusEffect: "overcharge" });
  }
  burst(x, y, 20, "#42e8ff", 220);
  pulse(x, y, radius, "#42e8ff", 0.32);
  world.weaponFx.push({ kind: "shockRing", x, y, radius, life: 0.28, maxLife: 0.28, color: "#42e8ff" });
}

export function onEnemyKilled(enemy) {
  if (!enemy) return;
  if (enemy.targetMarked) {
    dropCoinBurst(enemy.x, enemy.y, 18 + Math.floor(state.wave * 1.2), "#ffd166");
    pulse(enemy.x, enemy.y, 190, "#ffd166", 0.36);
    revealNearbyEnemies(enemy.x, enemy.y, 260);
  }
  const p = state.player;
  if (!p?.bountyTargets?.length) return;
  for (const bounty of p.bountyTargets) {
    if (bounty.complete || bounty.type !== enemy.type) continue;
    bounty.kills++;
    if (bounty.kills < bounty.need) continue;
    bounty.complete = true;
    dropCoinBurst(enemy.x, enemy.y, 24 + state.wave, "#ffd166");
    pulse(enemy.x, enemy.y, 150, "#ffd166", 0.32);
  }
}

export function enemyTarget(enemy) {
  const decoy = nearestActiveDecoy(enemy?.x || 0, enemy?.y || 0);
  return decoy || state.player;
}

export function interceptEnemyProjectile(projectile) {
  const p = state.player;
  if (!p || (p.counterCoils || 0) <= 0 || (p.counterCoilCooldown || 0) > 0) return false;
  const dx = p.x - projectile.x;
  const dy = p.y - projectile.y;
  if (dx * dx + dy * dy > 170 * 170) return false;
  p.counterCoilCooldown = Math.max(0.55, 2.7 - p.counterCoils * 0.28);
  const target = nearestWorldEnemy(projectile.x, projectile.y, 720);
  if (target) {
    target.takeDamage?.(70, projectile.x, projectile.y, { statusEffect: "counter_coil" });
    world.weaponFx.push({ kind: "arc", segments: [{ x1: projectile.x, y1: projectile.y, x2: target.x, y2: target.y, seed: Math.random() * 999 }], life: 0.16, maxLife: 0.16, color: "#42e8ff" });
  }
  burst(projectile.x, projectile.y, 8, "#42e8ff", 120);
  pulse(projectile.x, projectile.y, 42, "#42e8ff", 0.22);
  return true;
}

export function repayDebtFromCoin(value) {
  const p = state.player;
  let amount = Math.max(0, Math.round(value || 0));
  if (!p || (p.debt || 0) <= 0 || amount <= 0) return amount;
  const paid = Math.min(p.debt, amount);
  p.debt -= paid;
  amount -= paid;
  return amount;
}

export function trySavePlayerFromDeath() {
  const p = state.player;
  if (!p || p.hp > 0) return false;
  return triggerLifeSaver(p);
}

function applySplitShot(player) {
  const slots = (state.inventory?.weaponSlots || []).filter((slot) => splitShotWeaponIds().includes(slot.id));
  if (!slots.length) return;
  const slot = slots[Math.floor(Math.random() * slots.length)];
  slot.projectileBonus = (slot.projectileBonus || 0) + 1;
  slot.splitDamagePenalty = Math.max(slot.splitDamagePenalty || 0, 0.2);
  player.projectileBonus = 0;
  player.splitDamagePenalty = 0;
  recomputeAllWeapons();
}

function splitShotWeaponIds() {
  return ["arc", "ice", "missile", "boomerang", "drone", "prism_railgun", "void_singularity", "tesla_mine_chain", "starfall_scepter", "phase_needler", "echo_tuning_fork", "rift_loom"];
}

function updateAirburst(p, dt) {
  if (!p.airburstInterval) return;
  p.airburstTimer = Math.max(0, (p.airburstTimer || p.airburstInterval) - dt);
  if (p.airburstTimer > 0) return;
  p.airburstTimer += p.airburstInterval;
  const radius = Math.max(320, p.magnet * 2.2);
  let cleared = 0;
  for (let i = world.enemyProjectiles.length - 1; i >= 0; i--) {
    const b = world.enemyProjectiles[i];
    if (distSq(p.x, p.y, b.x, b.y) > radius * radius) continue;
    world.enemyProjectiles.splice(i, 1);
    cleared++;
    if (cleared <= 18) burst(b.x, b.y, 5, "#9ff4ff", 110);
  }
  if (!cleared) return;
  pulse(p.x, p.y, radius, "#9ff4ff", 0.28);
  world.weaponFx.push({ kind: "shockRing", x: p.x, y: p.y, radius, life: 0.35, maxLife: 0.35, color: "#9ff4ff" });
  state.shake = Math.max(state.shake, 4);
  playSfx("select");
}

function updateBleeds(dt) {
  for (const e of [...world.enemies]) {
    if (!e.bleedTimer || e.dead) continue;
    e.bleedTimer = Math.max(0, e.bleedTimer - dt);
    e.takeDamage?.((e.bleedDps || 0) * dt, e.x, e.y, { statusEffect: "bleed" });
    spawnBleedParticles(e, dt);
    if (e.bleedTimer <= 0) e.bleedDps = 0;
  }
}

function updateRewindHistory(dt) {
  const p = state.player;
  if (!p?.rewindHourglass || p.rewindUsed) return;
  p.rewindSampleTimer = Math.max(0, (p.rewindSampleTimer || 0) - dt);
  if (p.rewindSampleTimer > 0) return;
  p.rewindSampleTimer = 0.2;
  p.rewindHistory ||= [];
  p.rewindHistory.push({
    x: p.x,
    y: p.y,
    hp: p.hp,
    gold: state.gold,
    time: state.time,
  });
  while (p.rewindHistory.length > 36) p.rewindHistory.shift();
}

function triggerLifeSaver(p) {
  if ((p.escapeSmokeBombs || 0) > 0) {
    p.escapeSmokeBombs--;
    const oldX = p.x;
    const oldY = p.y;
    const pos = randomNearPlayerPosition(260, 520);
    p.x = pos.x;
    p.y = pos.y;
    p.hp = Math.max(1, Math.min(p.maxHp, Math.ceil(p.maxHp * 0.35)));
    p.invuln = 1.45;
    world.itemObjects.push({ kind: "smoke_cloud", x: oldX, y: oldY, r: 90, life: 1.2, maxLife: 1.2, color: "#cbd5e1" });
    burst(oldX, oldY, 34, "#cbd5e1", 160);
    pulse(oldX, oldY, 110, "#cbd5e1", 0.42);
    pulse(p.x, p.y, 80, "#b48cff", 0.34);
    playSfx("select");
    return true;
  }
  if (p.rewindHourglass && !p.rewindUsed && p.rewindHistory?.length) {
    const snap = p.rewindHistory[0];
    p.rewindUsed = true;
    p.x = snap.x;
    p.y = snap.y;
    p.hp = Math.max(1, snap.hp);
    state.gold = snap.gold;
    p.invuln = 1.2;
    const radius = 240;
    for (const e of world.enemies) {
      if (e.dead || distSq(p.x, p.y, e.x, e.y) > (radius + e.r) ** 2) continue;
      e.takeDamage?.(120, p.x, p.y, { statusEffect: "rewind_hourglass" });
    }
    burst(p.x, p.y, 42, "#ffd166", 260);
    pulse(p.x, p.y, radius, "#ffd166", 0.5);
    world.weaponFx.push({ kind: "shockRing", x: p.x, y: p.y, radius, life: 0.45, maxLife: 0.45, color: "#ffd166" });
    playSfx("select");
    return true;
  }
  return false;
}

function updateTargetMarkers() {
  const p = state.player;
  if (!p || (p.targetMarkerPending || 0) <= 0) return;
  const candidates = world.enemies.filter((e) => !e.dead && !e.targetMarked);
  if (!candidates.length) return;
  candidates.sort((a, b) => (b.hp || 0) + (b.damage || 0) * 12 - ((a.hp || 0) + (a.damage || 0) * 12));
  while (p.targetMarkerPending > 0 && candidates.length) {
    const target = candidates.shift();
    target.targetMarked = true;
    target.revealedTimer = 8;
    p.targetMarkerPending--;
    pulse(target.x, target.y, target.r * 2.7, "#ffd166", 0.34);
  }
}

function updateBountyTargets() {
  const p = state.player;
  if (!p || (p.bountyPending || 0) <= 0) return;
  const types = [...new Set(world.enemies.filter((e) => !e.dead && e.category === "小怪").map((e) => e.type))];
  while (p.bountyPending > 0 && types.length) {
    const type = types.splice(Math.floor(Math.random() * types.length), 1)[0];
    p.bountyTargets ||= [];
    p.bountyTargets.push({ type, kills: 0, need: Math.max(3, Math.min(10, 3 + Math.floor(state.wave / 3))), complete: false });
    p.bountyPending--;
  }
}

function updateEmergencyGate() {
  const p = state.player;
  if (!p?.emergencyGateReady || world.enemies.length < 34) return;
  p.emergencyGateReady = false;
  const backX = -(p.dirX || 1);
  const backY = -(p.dirY || 0);
  const x = p.x + backX * 92;
  const y = p.y + backY * 92;
  world.itemObjects.push({
    kind: "emergency_gate",
    x,
    y,
    angle: Math.atan2(backY, backX) + Math.PI / 2,
    r: 120,
    life: 8,
    maxLife: 8,
    damageTick: 0,
    color: "#42e8ff",
  });
  pulse(x, y, 160, "#42e8ff", 0.42);
}

function spawnBleedParticles(e, dt) {
  if (Math.random() < dt * 6) {
    const ox = (Math.random() - 0.5) * e.r * 1.4;
    const oy = (Math.random() - 0.5) * e.r * 1.2;
    trail(e.x + ox, e.y + oy, e.x + ox + (Math.random() - 0.5) * 18, e.y + oy + 8 + Math.random() * 14, "#ff4d6d", 4);
  }
  if (Math.random() < dt * 4) {
    particle("spark", e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.45) * e.r, {
      vx: (Math.random() - 0.5) * 34,
      vy: 24 + Math.random() * 42,
      life: 0.22 + Math.random() * 0.18,
      size: 2 + Math.random() * 2,
      color: "#ff4d6d",
      alpha: 0.88,
    });
  }
}

function updateItemObjects(dt) {
  for (let i = world.itemObjects.length - 1; i >= 0; i--) {
    const obj = world.itemObjects[i];
    obj.t = (obj.t || 0) + dt;
    if (obj.kind === "turret") updateTurret(obj, dt);
    else if (obj.kind === "landmine") updateLandmine(obj);
    else if (obj.kind === "fallingStar") updateFallingStar(obj, dt);
    else if (obj.kind === "decoy_dummy") updateDecoyDummy(obj, dt);
    else if (obj.kind === "rift_beacon") updateRiftBeacon(obj);
    else if (obj.kind === "frost_canister") updateFrostCanister(obj);
    else if (obj.kind === "wound_seal") updateWoundSeal(obj);
    else if (obj.kind === "emergency_gate") updateEmergencyGateObject(obj, dt);
    if (obj.life !== undefined) {
      obj.life -= dt;
      if (obj.life <= 0) world.itemObjects.splice(i, 1);
    }
  }
}

function updateDecoyDummy(dummy, dt) {
  dummy.pulse = (dummy.pulse || 0) + dt;
  for (const e of world.enemies) {
    if (e.dead || distSq(dummy.x, dummy.y, e.x, e.y) > (dummy.r + e.r) ** 2) continue;
    dummy.hp -= Math.max(1, (e.damage || 6) * dt * 0.9);
  }
  if (dummy.hp > 0) return;
  dummy.life = 0;
  const radius = 150;
  for (const e of world.enemies) {
    if (e.dead || distSq(dummy.x, dummy.y, e.x, e.y) > (radius + e.r) ** 2) continue;
    const dx = e.x - dummy.x;
    const dy = e.y - dummy.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    e.knockbackX = (e.knockbackX || 0) + dx / d * 260;
    e.knockbackY = (e.knockbackY || 0) + dy / d * 260;
  }
  burst(dummy.x, dummy.y, 24, "#b48cff", 180);
  pulse(dummy.x, dummy.y, radius, "#b48cff", 0.38);
}

function updateRiftBeacon(beacon) {
  const p = state.player;
  if (!p || (p.riftBeaconCooldown || 0) > 0) return;
  if (distSq(beacon.x, beacon.y, p.x, p.y) > (beacon.r + p.r) ** 2) return;
  const pair = world.itemObjects.find((obj) => obj.kind === "rift_beacon" && obj.pairId === beacon.pairId && obj !== beacon);
  if (!pair) return;
  pulse(p.x, p.y, 82, "#b48cff", 0.35);
  p.x = pair.x;
  p.y = pair.y;
  p.riftBeaconCooldown = 1.2;
  pulse(p.x, p.y, 82, "#b48cff", 0.35);
}

function updateFrostCanister(canister) {
  if (canister.triggered) return;
  const target = nearestWorldEnemy(canister.x, canister.y, canister.triggerRadius || 80);
  if (!target) return;
  canister.triggered = true;
  canister.life = 0.5;
  const radius = 170;
  for (const e of world.enemies) {
    if (e.dead || e.boss || distSq(canister.x, canister.y, e.x, e.y) > (radius + e.r) ** 2) continue;
    e.freezeTimer = Math.max(e.freezeTimer || 0, 1.8);
  }
  burst(canister.x, canister.y, 22, "#9ff4ff", 220);
  pulse(canister.x, canister.y, radius, "#9ff4ff", 0.42);
}

function updateWoundSeal(seal) {
  const p = state.player;
  if (!p || seal.used || distSq(seal.x, seal.y, p.x, p.y) > (seal.r + p.r) ** 2) return;
  seal.used = true;
  seal.life = 0.2;
  p.hp = Math.min(p.maxHp, p.hp + seal.heal);
  burst(seal.x, seal.y, 12, "#77ff8a", 150);
  pulse(seal.x, seal.y, 72, "#77ff8a", 0.28);
}

function updateEmergencyGateObject(gate, dt) {
  gate.damageTick = Math.max(0, (gate.damageTick || 0) - dt);
  if (gate.damageTick > 0) return;
  gate.damageTick = 0.22;
  for (const e of world.enemies) {
    if (e.dead || distSq(gate.x, gate.y, e.x, e.y) > (gate.r + e.r) ** 2) continue;
    e.takeDamage?.(16, gate.x, gate.y, { statusEffect: "emergency_gate" });
    const dx = e.x - gate.x;
    const dy = e.y - gate.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    e.knockbackX = (e.knockbackX || 0) + dx / d * 130;
    e.knockbackY = (e.knockbackY || 0) + dy / d * 130;
  }
}

function updateTurret(turret, dt) {
  turret.cooldown = Math.max(0, (turret.cooldown || 0) - dt);
  const target = nearestWorldEnemy(turret.x, turret.y, turret.range);
  turret.targetAngle = target ? Math.atan2(target.y - turret.y, target.x - turret.x) : (turret.targetAngle || 0) + dt * 0.8;
  if (!target || turret.cooldown > 0) return;
  turret.cooldown = 0.42;
  const damage = 32;
  target.takeDamage?.(damage, target.x, target.y);
  pulse(target.x, target.y, 24, "#42e8ff", 0.16);
  world.weaponFx.push({ kind: "turretBeam", x1: turret.x, y1: turret.y, x2: target.x, y2: target.y, life: 0.12, maxLife: 0.12, color: "#42e8ff" });
  playSfx("shoot");
}

function updateLandmine(mine) {
  if (mine.triggered) return;
  const target = nearestWorldEnemy(mine.x, mine.y, mine.triggerRadius);
  if (!target) return;
  mine.triggered = true;
  mine.life = 0.42;
  const radius = mine.radius;
  for (const e of world.enemies) {
    if (e.dead || distSq(mine.x, mine.y, e.x, e.y) > (radius + e.r) ** 2) continue;
    e.takeDamage?.(95, mine.x, mine.y);
  }
  burst(mine.x, mine.y, 26, "#ffd166", 260);
  pulse(mine.x, mine.y, radius, "#ff7a2f", 0.34);
  world.weaponFx.push({ kind: "itemMineBlast", x: mine.x, y: mine.y, radius, life: 0.34, maxLife: 0.34, color: "#ff7a2f", seed: Math.random() * 999 });
  state.shake = Math.max(state.shake, 5);
  playSfx("explode");
}

function triggerStarCloak(x, y, stacks) {
  const count = Math.min(18, 5 + stacks * 3);
  for (let i = 0; i < count; i++) {
    const tx = x + (Math.random() - 0.5) * 260;
    const ty = y + (Math.random() - 0.5) * 180;
    const delay = i * 0.025;
    world.itemObjects.push({
      kind: "fallingStar",
      x: tx - 80 + Math.random() * 160,
      y: ty - 360 - Math.random() * 120,
      targetX: tx,
      targetY: ty,
      vx: 0,
      vy: 980 + Math.random() * 180,
      r: 9,
      damage: 42,
      delay,
      life: 1.2,
      maxLife: 1.2,
      color: "#ffd166",
    });
  }
}

export function updateFallingStar(star, dt) {
  star.delay = Math.max(0, (star.delay || 0) - dt);
  if (star.delay > 0) return;
  star.x += (star.targetX - star.x) * Math.min(1, dt * 2.2);
  star.y += star.vy * dt;
  trail(star.x, star.y, star.x - 18, star.y - 44, "#ffd166", 8);
  if (star.y < star.targetY) return;
  star.life = 0;
  for (const e of world.enemies) {
    if (e.dead || distSq(star.targetX, star.targetY, e.x, e.y) > (76 + e.r) ** 2) continue;
    e.takeDamage?.(star.damage, star.targetX, star.targetY);
  }
  burst(star.targetX, star.targetY, 18, "#ffd166", 220);
  pulse(star.targetX, star.targetY, 76, "#ffd166", 0.25);
  world.weaponFx.push({ kind: "starImpact", x: star.targetX, y: star.targetY, radius: 76, life: 0.28, maxLife: 0.28, color: "#ffd166" });
}

function spawnTurret() {
  const p = state.player;
  const pos = randomNearPlayerPosition(90, 220);
  world.itemObjects.push({
    kind: "turret",
    x: pos.x,
    y: pos.y,
    range: 560,
    cooldown: Math.random() * 0.35,
    targetAngle: Math.random() * TAU,
    t: 0,
    color: "#42e8ff",
  });
  pulse(pos.x, pos.y, 48, "#42e8ff", 0.35);
  if (p) burst(pos.x, pos.y, 10, "#42e8ff", 120);
}

function spawnLandmine() {
  const pos = randomArenaPosition();
  world.itemObjects.push({
    kind: "landmine",
    x: pos.x,
    y: pos.y,
    triggerRadius: 58,
    radius: 118,
    t: Math.random() * TAU,
    color: "#ff7a2f",
  });
}

function spawnDecoyDummy(index = 0) {
  const pos = randomNearPlayerPosition(120 + index * 18, 260 + index * 24);
  world.itemObjects.push({
    kind: "decoy_dummy",
    x: pos.x,
    y: pos.y,
    r: 26,
    hp: 70 + state.wave * 8,
    life: 18,
    maxLife: 18,
    color: "#b48cff",
  });
  pulse(pos.x, pos.y, 58, "#b48cff", 0.34);
}

function spawnRiftBeacons() {
  const pairId = `rift-${state.wave}-${Math.random()}`;
  for (let i = 0; i < 2; i++) {
    const pos = randomNearPlayerPosition(190 + i * 120, 360 + i * 160);
    world.itemObjects.push({
      kind: "rift_beacon",
      pairId,
      x: pos.x,
      y: pos.y,
      r: 34,
      life: 24,
      maxLife: 24,
      color: "#b48cff",
    });
    pulse(pos.x, pos.y, 70, "#b48cff", 0.34);
  }
}

function spawnFrostCanister() {
  const pos = randomArenaPosition();
  world.itemObjects.push({
    kind: "frost_canister",
    x: pos.x,
    y: pos.y,
    r: 22,
    triggerRadius: 90,
    life: 28,
    maxLife: 28,
    color: "#9ff4ff",
  });
}

function spawnWoundSeal(p, damage) {
  const count = Math.min(5, p.woundSeals || 0);
  world.itemObjects.push({
    kind: "wound_seal",
    x: p.x,
    y: p.y,
    r: 46,
    heal: Math.max(3, Math.round(damage * (0.28 + count * 0.04))),
    life: 5 + count * 0.75,
    maxLife: 5 + count * 0.75,
    color: "#77ff8a",
  });
}

function randomArenaPosition() {
  const half = WORLD_SIZE / 2 - 180;
  const p = state.player;
  for (let i = 0; i < 10; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const y = (Math.random() * 2 - 1) * half;
    if (!p || distSq(x, y, p.x, p.y) > 260 * 260) return { x, y };
  }
  return { x: (p?.x || 0) + 220, y: p?.y || 0 };
}

function randomNearPlayerPosition(minDist = 80, maxDist = 220) {
  const p = state.player;
  if (!p) return randomArenaPosition();
  const half = WORLD_SIZE / 2 - 120;
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * TAU;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = clamp(p.x + Math.cos(angle) * dist, -half, half);
    const y = clamp(p.y + Math.sin(angle) * dist, -half, half);
    return { x, y };
  }
  return { x: clamp(p.x + maxDist, -half, half), y: p.y };
}

function nearestWorldEnemy(x, y, range) {
  let best = null;
  let bestD = range * range;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = distSq(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function nearestActiveDecoy(x, y) {
  let best = null;
  let bestD = 420 * 420;
  for (const obj of world.itemObjects) {
    if (obj.kind !== "decoy_dummy" || obj.life <= 0 || obj.hp <= 0) continue;
    const d = distSq(x, y, obj.x, obj.y);
    if (d < bestD) {
      bestD = d;
      best = obj;
    }
  }
  return best;
}

function dropCoinBurst(x, y, amount, color = "#ffd166") {
  import("./entities.js").then(({ dropCoin }) => dropCoin(x, y, amount));
  burst(x, y, 16, color, 160);
}

function revealNearbyEnemies(x, y, radius) {
  for (const e of world.enemies) {
    if (e.dead || distSq(x, y, e.x, e.y) > (radius + e.r) ** 2) continue;
    e.flash = Math.max(e.flash || 0, 0.55);
  }
}

function recordItem(item, quality, qty) {
  const inv = state.inventory;
  if (!inv) return;
  const id = `${item.id}_${quality}`;
  const existing = inv.items.find((entry) => entry.id === id);
  const qualityInfo = QUALITY_INFO[quality] || QUALITY_INFO.common;
  if (existing) existing.qty = item.unique ? 1 : existing.qty + qty;
  else inv.items.push({ id, itemId: item.id, quality, name: item.singleQuality ? item.name : `${qualityInfo.name}${item.name}`, icon: item.icon, qty: item.unique ? 1 : qty, desc: itemDescription(item, quality) });
  recordCodexEntry("items", item.id);
}

function qualityValue(id, quality) {
  const values = QUALITY_VALUES[id];
  return values?.[qualityRank(quality)] ?? 0;
}

function qualityScale(quality) {
  return QUALITY_SCALE[quality] || 1;
}

function qualityRank(quality) {
  return Math.max(0, QUALITY_ORDER.indexOf(quality || "common"));
}

function weightedChoice(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
