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

function toScreen(point, view, camera) {
  return {
    x: (point.x - camera.x) * CAMERA_ZOOM + view.width / 2,
    y: (point.y - camera.y) * CAMERA_ZOOM + view.height / 2,
  };
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
