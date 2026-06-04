const QUALITY_RANK = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const ITEM_VALUES = {
  heart_container: 78,
  healing_potion: 56,
  healing_aura: 74,
  tardigrade: 82,
  heavy_armor: 58,
  speed_boots: 76,
  rapid_cord: 82,
  knife: 78,
  gloves: 62,
  fang: 58,
  split_shot: 84,
  magnet: 64,
  lucky_clover: 52,
  thief_mark: 48,
  star_cloak: 58,
  landmine: 48,
  airburst: 74,
  turret: 56,
  shackles: 30,
  dodge_cloak: 42,
  bait: 16,
};

export function decideShopActions({ offers, player, inventory, state, refreshCost, refreshesUsed = 0, config = {} }) {
  const actions = [];
  const scored = (offers || [])
    .filter((offer) => !isSoldOut(offer))
    .map((offer) => scoreOffer({ offer, player, inventory, state }))
    .sort((a, b) => b.score - a.score);

  for (const entry of scored) {
    if (entry.score >= 50 && state.gold >= entry.offer.price + reserveGold(state)) {
      actions.push({ type: "buy", uid: entry.offer.uid, fuseWeaponUid: entry.fuseWeaponUid, score: entry.score, reason: entry.reason });
      state = { ...state, gold: state.gold - entry.offer.price };
    } else if (entry.score >= 72 && state.gold < entry.offer.price && !entry.offer.locked && config.lockAffordableHighValue !== false) {
      actions.push({ type: "lock", uid: entry.offer.uid, score: entry.score, reason: "high_value_not_enough_gold" });
    }
  }

  const bestScore = scored
    .filter((entry) => state.gold >= (entry.offer.price || 0) + reserveGold(state))
    .reduce((best, entry) => Math.max(best, entry.score), 0);
  const canRefresh = state.gold >= refreshCost + reserveGold(state) && refreshesUsed < (config.maxRefreshesPerShop ?? 2);
  if (bestScore < 58 && canRefresh) actions.push({ type: "refresh", cost: refreshCost, reason: "low_offer_value" });
  actions.push({ type: "continue" });
  return actions;
}

export function scoreOffer({ offer, player, inventory, state }) {
  const category = offerCategory(offer);
  const rank = QUALITY_RANK[offer.rarity] ?? 0;
  let score = 0;
  let reason = "baseline";
  let fuseWeaponUid = null;

  if (category === "weapon") {
    const matching = (inventory?.weaponSlots || []).find((slot) => slot.id === offer.weaponId && slot.quality === offer.rarity);
    const hasSpace = (inventory?.weaponSlots || []).length < 6;
    if (matching) {
      score = 92 + rank * 8;
      fuseWeaponUid = matching.uid;
      reason = "fuse";
    } else if (hasSpace) {
      score = 50 + rank * 14 + (offer.weaponId === state.initialWeaponId ? 12 : 0);
      reason = offer.weaponId === state.initialWeaponId ? "starter_stack" : "new_weapon";
    } else {
      score = -100;
      reason = "slots_full";
    }
  } else {
    const id = offer.itemId || offer.id;
    score = (ITEM_VALUES[id] ?? 35) + rank * 8;
    reason = id;
    const hpRatio = player.maxHp ? player.hp / player.maxHp : 1;
    if (["heart_container", "healing_potion", "healing_aura", "tardigrade", "heavy_armor"].includes(id)) score += (1 - hpRatio) * 45;
    if (["speed_boots", "magnet"].includes(id) && state.wave <= 8) score += 12;
    if (["rapid_cord", "knife", "split_shot"].includes(id)) score += Math.max(0, 1.25 - (player.damageScale || 1)) * 30;
    if (id === "bait" && (player.hp < player.maxHp * 0.8 || state.wave > 6)) score -= 45;
    if (id === "shackles" && (player.speed || 0) < 230) score -= 30;
    if (id === "dodge_cloak" && player.maxHp < 90) score -= 25;
    if (id === "thief_mark" && state.gold > 80) score -= 18;
  }

  const affordability = Math.min(1, Math.max(0.35, (state.gold || 0) / Math.max(1, offer.price || 1)));
  if ((offer.price || 0) > (state.gold || 0)) score *= 0.92;
  else score *= affordability;
  return { offer, score, reason, fuseWeaponUid };
}

function reserveGold(state) {
  return Math.min(24, 6 + (state.wave || 1));
}

function isSoldOut(offer) {
  return (offer.purchaseCount || 0) >= (offer.maxPurchases || 1);
}

function offerCategory(offer) {
  if (offer.weaponId) return "weapon";
  return "item";
}
