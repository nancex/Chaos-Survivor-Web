import { SAVE_KEY, TOTAL_WAVES } from "./constants.js";
import { state } from "./state.js";
import { choice, formatTime } from "./utils.js";
import { startWeaponPreview } from "./weaponPreview.js";

let stopPreview = null;

export const ui = {
  canvas: document.getElementById("gameCanvas"),
  hpBar: document.getElementById("hpBar"),
  hpText: document.getElementById("hpText"),
  xpBar: document.getElementById("xpBar"),
  levelText: document.getElementById("levelText"),
  timerText: document.getElementById("timerText"),
  waveText: document.getElementById("waveText"),
  killText: document.getElementById("killText"),
  coinText: document.getElementById("coinText"),
  fpsText: document.getElementById("fpsText"),
  startOverlay: document.getElementById("startOverlay"),
  levelOverlay: document.getElementById("levelOverlay"),
  endOverlay: document.getElementById("endOverlay"),
  levelEyebrow: document.querySelector("#levelOverlay .eyebrow"),
  levelTitle: document.querySelector("#levelOverlay h2"),
  choiceList: document.getElementById("choiceList"),
  startButton: document.getElementById("startButton"),
  restartButton: document.getElementById("restartButton"),
  pauseButton: document.getElementById("pauseButton"),
  muteButton: document.getElementById("muteButton"),
  bestText: document.getElementById("bestText"),
  endEyebrow: document.getElementById("endEyebrow"),
  endTitle: document.getElementById("endTitle"),
  endStats: document.getElementById("endStats"),
  touchStick: document.getElementById("touchStick"),
};

export function updateHud(fps) {
  const p = state.player;
  if (!p) return;
  ui.hpBar.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
  ui.xpBar.style.transform = `scaleX(${Math.max(0, p.xp / p.xpNeed)})`;
  ui.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}`;
  ui.levelText.textContent = `Lv.${p.level}`;
  ui.timerText.textContent = state.bossWaveActive ? "BOSS" : formatTime(state.waveTimeLeft);
  ui.waveText.textContent = `第 ${state.wave}/${TOTAL_WAVES} 波`;
  ui.killText.textContent = `击败 ${state.kills}`;
  ui.coinText.textContent = `碎片 ${state.shards}`;
  ui.fpsText.textContent = `${Math.round(fps)} fps`;
}

export function updateBestText() {
  ui.bestText.textContent = `最佳纪录 ${formatTime(Number(localStorage.getItem(SAVE_KEY) || 0))}`;
}

export function showChoices({ eyebrow, title, items, onPick }) {
  clearPreview();
  ui.levelEyebrow.textContent = eyebrow;
  ui.levelTitle.textContent = title;
  ui.choiceList.innerHTML = "";
  ui.choiceList.className = "choice-list";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-card";
    button.innerHTML = `<i>${item.icon}</i><strong>${item.name}</strong><p>${item.desc}</p>`;
    button.addEventListener("click", () => onPick(item), { once: true });
    ui.choiceList.appendChild(button);
  }
  ui.levelOverlay.classList.add("active");
}

export function showWeaponCarousel({ eyebrow, title, items, onPick }) {
  clearPreview();
  let index = 0;
  ui.levelEyebrow.textContent = eyebrow;
  ui.levelTitle.textContent = title;
  ui.choiceList.innerHTML = "";
  ui.choiceList.className = "choice-list weapon-choice-list";

  const root = document.createElement("div");
  root.className = "weapon-carousel";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "weapon-nav";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "上一种武器");
  const next = document.createElement("button");
  next.type = "button";
  next.className = "weapon-nav";
  next.textContent = "›";
  next.setAttribute("aria-label", "下一种武器");
  const card = document.createElement("article");
  card.className = "weapon-card";
  const canvas = document.createElement("canvas");
  canvas.className = "weapon-preview";
  const name = document.createElement("strong");
  const desc = document.createElement("p");
  const tags = document.createElement("div");
  tags.className = "weapon-tags";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary weapon-confirm";
  confirm.textContent = "选择武器";

  card.append(canvas, name, desc, tags, confirm);
  root.append(prev, card, next);
  ui.choiceList.appendChild(root);

  function renderInfo() {
    const item = items[index];
    name.textContent = `${item.icon} ${item.name}`;
    desc.textContent = item.desc;
    tags.innerHTML = "";
    weaponTags(item.id).forEach((text) => {
      const tag = document.createElement("span");
      tag.textContent = text;
      tags.appendChild(tag);
    });
  }

  prev.addEventListener("click", () => {
    index = (index - 1 + items.length) % items.length;
    renderInfo();
  });
  next.addEventListener("click", () => {
    index = (index + 1) % items.length;
    renderInfo();
  });
  confirm.addEventListener("click", () => onPick(items[index]), { once: true });
  renderInfo();
  stopPreview = startWeaponPreview(canvas, () => items[index]);
  ui.levelOverlay.classList.add("active");
}

export function hideChoices() {
  clearPreview();
  ui.levelOverlay.classList.remove("active");
}

export function pickThree(items) {
  return choice(items, 3);
}

export function showEnd(victory) {
  const p = state.player;
  ui.endEyebrow.textContent = victory ? "VICTORY" : "RUN COMPLETE";
  ui.endTitle.textContent = victory ? "20 波已完成" : "生存结束";
  ui.endStats.innerHTML = "";
  [`时间 ${formatTime(state.time)}`, `等级 ${p.level}`, `击败 ${state.kills}`, `碎片 ${state.shards}`].forEach((text) => {
    const item = document.createElement("span");
    item.textContent = text;
    ui.endStats.appendChild(item);
  });
  ui.endOverlay.classList.add("active");
  updateBestText();
}

function weaponTags(id) {
  const tags = {
    arc: ["自动锁定", "连锁传导", "即时命中"],
    ice: ["追踪", "冻结控制", "单体压制"],
    missile: ["追踪", "范围爆炸", "群体清理"],
    boomerang: ["远距离", "往返切割", "高穿透"],
    drone: ["自动炮台", "离身攻击", "持续输出"],
  };
  return tags[id] || ["武器"];
}

function clearPreview() {
  if (stopPreview) {
    stopPreview();
    stopPreview = null;
  }
}
