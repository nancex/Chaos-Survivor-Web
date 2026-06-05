import { CAMERA_ZOOM } from "../constants.js";
import { state, world } from "../state.js";

export function drawAiDebug(ctx, view, camera) {
  const runtime = state.ai?.runtime;
  const config = state.ai?.config;
  if (!runtime?.enabled || !config?.debugDraw) return;
  const p = state.player;
  if (!p) return;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawTarget(ctx, runtime, view, camera);
  drawVelocity(ctx, runtime, p, view, camera);
  drawThreats(ctx, runtime, view, camera);
  drawBossRange(ctx, runtime, view, camera);
  ctx.restore();
}

export function drawAiHud(ctx, view) {
  const runtime = state.ai?.runtime;
  if (!runtime?.enabled || state.mode === "menu") return;
  const training = state.ai?.training || {};
  const config = state.ai?.config || {};
  if (config.hud?.showAiPanel === false) return;
  const runs = training.totalRuns || 0;
  const victories = training.victories || 0;
  const winRate = runs ? Math.round(victories / runs * 100) : 0;
  const target = runtime.currentTarget?.kind || (state.mode === "playing" ? "thinking" : state.mode);
  const risk = Math.round(runtime.lastPlanRisk || 0);
  const threatCount = runtime.lastThreatCount || runtime.debugThreats?.length || 0;
  const latestDeath = [...(training.recentRuns || [])].reverse().find((run) => !run.victory)?.deathReason || "";
  const recommendation = training.recommendations || {};
  const perf = runtime.perf?.movementPlanMs;
  const avgMs = perf ? (perf.total / Math.max(1, perf.count)).toFixed(1) : "0.0";
  const compact = view.width < 760;
  const profile = runtime.dynamicProfile || config.runtimeProfile || config.profile || "balanced";
  const profileText = profileName(profile);
  const targetText = targetName(target);
  const latestDeathText = deathReasonName(latestDeath);
  const recommendedText = profileName(recommendation.profile || config.profile || "balanced");
  const reasonText = dynamicReasonName(runtime.dynamicProfileReason || "base");
  const difficultyText = difficultyName(state.difficulty || { id: state.difficultyId || recommendation.difficultyId || "" });
  const lines = compact ? [
    ["状态", `${runtime.enabled ? "训练" : "关闭"} ${profileText}`],
    ["轮次", `${runs}局 胜率${winRate}%`],
    ["难度", difficultyText],
    ["目标", targetText],
    ["风险", `${risk} 威胁${threatCount}`],
  ] : [
    ["状态", `${runtime.enabled ? "训练中" : "关闭"} ${profileText}`],
    ["轮次", `${runs}局 胜率${winRate}%`],
    ["难度", difficultyText],
    ["计划", `${targetText} 风险${risk} 威胁${threatCount}`],
    ["训练", `${latestDeathText} -> ${recommendedText}`],
    ["策略", `${profileText} (${reasonText})`],
    ["性能", `${avgMs}ms  预算${runtime.budgetLevel || 0}`],
  ];
  const padding = compact ? 14 : 16;
  const labelWidth = Math.ceil(Math.max(...lines.map(([label]) => textWidth(ctx, label)), 28));
  const valueWidth = Math.ceil(Math.max(...lines.map(([, value]) => textWidth(ctx, value)), compact ? 96 : 150));
  const columnGap = compact ? 16 : 20;
  const desiredWidth = padding * 2 + labelWidth + columnGap + valueWidth;
  const width = compact
    ? Math.min(300, Math.max(238, desiredWidth, view.width * 0.5))
    : Math.min(380, Math.max(320, desiredWidth, view.width * 0.36));
  const rowH = compact ? 20 : 21;
  const height = 20 + lines.length * rowH;
  const x = Math.max(8, view.width - width - 14);
  const y = 14;
  const labelX = x + padding;
  const valueX = labelX + labelWidth + columnGap;
  const valueMaxWidth = Math.max(40, x + width - padding - valueX);
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawHudPanel(ctx, x, y, width, height, risk);
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, width - 8, height - 8);
  ctx.clip();
  ctx.font = "11px 'Zpix', 'Fusion Pixel 12px Monospaced SC', 'Cubic 11', 'Courier New', monospace";
  ctx.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    const rowY = y + 15 + i * rowH;
    const [label, value] = lines[i];
    ctx.fillStyle = i === 0 ? "#77ff8a" : "rgba(159,244,255,0.82)";
    ctx.fillText(label, labelX, rowY);
    ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.88)";
    ctx.fillText(fitText(ctx, value, valueMaxWidth), valueX, rowY);
  }
  ctx.restore();
}

function textWidth(ctx, text) {
  if (typeof ctx.measureText === "function") return ctx.measureText(String(text)).width || 0;
  return String(text).length * 7;
}

function fitText(ctx, text, maxWidth) {
  const source = String(text);
  if (textWidth(ctx, source) <= maxWidth) return source;
  const ellipsis = "...";
  let output = source;
  while (output.length > 1 && textWidth(ctx, `${output}${ellipsis}`) > maxWidth) output = output.slice(0, -1);
  return `${output}${ellipsis}`;
}

function difficultyName(difficulty) {
  const id = typeof difficulty === "string" ? difficulty : difficulty?.id;
  const name = typeof difficulty === "object" ? difficulty?.name : "";
  if (name) return name;
  return ({
    ember: "难度1",
    neon: "难度2",
    overclock: "难度3",
    singularity: "难度4",
    apocalypse: "难度5",
    void_crown: "难度6",
  })[id] || id || "未知";
}

function profileName(id) {
  return ({
    balanced: "均衡",
    survivor: "生存",
    aggressive: "进攻",
    farmer: "发育",
  })[id] || id || "均衡";
}

function targetName(kind) {
  return ({
    thinking: "思考",
    collect: "拾取",
    farm: "拉扯",
    survive: "避险",
    breakout: "突围",
    center_return: "回中",
    blackhole_escape: "黑洞脱离",
    disruption_move: "脱离干扰",
    storm_rail_dash_evade: "躲冲刺",
    escape_route: "逃生路线",
    shop: "商店",
    leveling: "升级",
    ended: "结算",
  })[kind] || kind || "待机";
}

function deathReasonName(reason) {
  if (!reason) return "暂无";
  return ({
    victory: "胜利",
    death_by_projectile: "弹幕伤害",
    death_by_hazard: "区域伤害",
    death_by_enemy_contact: "敌人接触",
    greedy_collect_death: "贪拾取",
    corner_pressure_death: "边角压制",
    boss_dash_death: "Boss冲刺",
    hazard_standstill_death: "区域停滞",
    low_boss_damage: "Boss输出不足",
    low_damage: "输出不足",
    low_gold: "经济不足",
    corner_stuck: "边角卡住",
    death_by_pressure: "压力死亡",
  })[reason] || reason;
}

function dynamicReasonName(reason) {
  return ({
    disabled: "固定",
    survival_pressure: "生存压力",
    economy_gap: "经济缺口",
    boss_or_damage_window: "输出窗口",
    base: "默认",
  })[reason] || reason || "默认";
}

function toScreen(point, view, camera) {
  return {
    x: (point.x - camera.x) * CAMERA_ZOOM + view.width / 2,
    y: (point.y - camera.y) * CAMERA_ZOOM + view.height / 2,
  };
}

function drawHudPanel(ctx, x, y, w, h, risk) {
  const danger = risk > 85;
  ctx.fillStyle = "rgba(6,9,18,0.78)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = danger ? "rgba(255,77,109,0.12)" : "rgba(66,232,255,0.08)";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.strokeStyle = danger ? "rgba(255,77,109,0.92)" : "rgba(66,232,255,0.82)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
}

function drawTarget(ctx, runtime, view, camera) {
  const target = runtime.currentTarget;
  if (!target) return;
  const p = toScreen(target, view, camera);
  ctx.strokeStyle = "#77ff8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#77ff8a";
  ctx.font = "12px monospace";
  ctx.fillText(target.kind || "target", p.x + 14, p.y - 8);
}

function drawVelocity(ctx, runtime, player, view, camera) {
  const start = toScreen(player, view, camera);
  const v = runtime.lastVelocity || { x: 0, y: 0 };
  ctx.strokeStyle = "#42e8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x + v.x * 0.35, start.y + v.y * 0.35);
  ctx.stroke();
}

function drawThreats(ctx, runtime, view, camera) {
  const threats = (runtime.debugThreats || []).slice(0, 18);
  ctx.strokeStyle = "rgba(255,77,109,0.62)";
  ctx.lineWidth = 1;
  for (const threat of threats) {
    const p = toScreen(threat, view, camera);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(6, (threat.r || 8) * CAMERA_ZOOM), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBossRange(ctx, runtime, view, camera) {
  const target = runtime.currentTarget;
  if (!world.boss || !target?.range) return;
  const p = toScreen(world.boss, view, camera);
  ctx.strokeStyle = "rgba(255,209,102,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, target.range.ideal * CAMERA_ZOOM, 0, Math.PI * 2);
  ctx.stroke();
}
