import { state } from "./state.js";
import { QUALITY_INFO } from "./inventory.js";
import {
  isSoldOut,
  prepareShopOffers,
  purchaseDisabledReason,
  purchaseOffer,
  refreshCost,
  refreshShopOffers,
  toggleOfferLock,
} from "./shop.js";

const dom = {};
let continueHandler = null;

export function initShopUi({ continueToNextWave }) {
  continueHandler = continueToNextWave;
  dom.overlay = document.getElementById("shopOverlay");
  dom.gold = document.getElementById("shopGoldText");
  dom.list = document.getElementById("shopOfferList");
  dom.refresh = document.getElementById("shopRefreshButton");
  dom.continue = document.getElementById("shopContinueButton");
  dom.hint = document.getElementById("shopHint");

  dom.refresh?.addEventListener("click", () => {
    if (refreshShopOffers()) renderShop();
    else renderShop("金币不足，无法刷新。");
  });
  dom.continue?.addEventListener("click", () => {
    closeShop();
    continueHandler?.();
  });
}

export function openShop() {
  prepareShopOffers({ preserveLocked: true });
  state.mode = "shop";
  renderShop();
  dom.overlay?.classList.add("active");
}

export function closeShop() {
  dom.overlay?.classList.remove("active");
}

export function isShopOpen() {
  return state.mode === "shop" || dom.overlay?.classList.contains("active");
}

export function renderShop(message = "") {
  if (!dom.list || !state.shop) return;
  dom.gold.textContent = String(state.gold);
  const cost = refreshCost();
  dom.refresh.textContent = `刷新商品 - ${cost} 金币`;
  dom.refresh.disabled = state.gold < cost;
  dom.list.innerHTML = "";
  for (const offer of state.shop.offers) dom.list.appendChild(renderOffer(offer));
  dom.hint.textContent = message || "锁定的商品不会在刷新或下次进入商店时变化。";
}

function renderOffer(offer) {
  const quality = QUALITY_INFO[offer.rarity] || QUALITY_INFO.common;
  const soldOut = isSoldOut(offer);
  const reason = purchaseDisabledReason(offer);
  const card = document.createElement("article");
  card.className = `shop-card${soldOut ? " sold-out" : ""}`;
  card.style.setProperty("--quality", quality.color);

  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = `shop-lock${offer.locked ? " active" : ""}`;
  lock.textContent = offer.locked ? "已锁定" : "锁定";
  lock.disabled = soldOut;
  lock.addEventListener("click", () => {
    toggleOfferLock(offer.uid);
    renderShop();
  });

  const buy = document.createElement("button");
  buy.type = "button";
  buy.className = "primary shop-buy";
  buy.textContent = soldOut ? "已售罄" : `购买 ${offer.price}`;
  buy.disabled = Boolean(reason);
  buy.title = reason;
  buy.addEventListener("click", () => {
    const result = purchaseOffer(offer.uid);
    renderShop(result.ok ? "购买成功。" : result.reason);
  });

  card.innerHTML = `
    <div class="shop-card-top">
      <i>${offer.icon}</i>
      <div>
        <strong>${offer.name}</strong>
        <span style="color:${quality.color}">${quality.name} · ${offer.category}</span>
      </div>
    </div>
    <p>${offer.desc}</p>
    <div class="shop-meta">
      <span>数量 x${offer.quantity}</span>
      <span>${offer.purchaseCount}/${offer.maxPurchases}</span>
      <span>${offer.price} 金币</span>
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "shop-card-actions";
  actions.append(lock, buy);
  card.appendChild(actions);
  return card;
}
