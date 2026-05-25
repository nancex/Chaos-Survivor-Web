const TAU = Math.PI * 2;

export function startWeaponPreview(canvas, getWeapon) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let stopped = false;

  function frame(now) {
    if (stopped) return;
    drawWeaponPreview(ctx, canvas, getWeapon(), now / 1000);
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export function drawWeaponPreview(ctx, canvas, weapon, t) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(220, canvas.clientWidth || 360);
  const h = Math.max(150, canvas.clientHeight || 200);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(3,8,16,0.84)";
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h, t);
  const cx = w / 2;
  const cy = h / 2;
  drawPlayerHead(ctx, cx, cy, t);
  if (!weapon) return;
  if (weapon.id === "arc") drawArc(ctx, cx, cy, t);
  else if (weapon.id === "ice") drawIce(ctx, cx, cy, t);
  else if (weapon.id === "missile") drawMissile(ctx, cx, cy, t);
  else if (weapon.id === "boomerang") drawBoomerang(ctx, cx, cy, t);
  else if (weapon.id === "drone") drawDrones(ctx, cx, cy, t);
}

function drawGrid(ctx, w, h, t) {
  ctx.strokeStyle = "rgba(66,232,255,0.08)";
  ctx.lineWidth = 1;
  const offset = (t * 18) % 24;
  for (let x = -offset; x < w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = offset; y < h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPlayerHead(ctx, x, y, t) {
  glow(ctx, x, y, 26, "#ffd6a8", 0.28);
  ctx.fillStyle = "#ffd6a8";
  ctx.beginPath();
  ctx.arc(x, y, 20 + Math.sin(t * 5) * 0.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7b4a2b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#2a1d18";
  ctx.beginPath();
  ctx.arc(x - 7, y - 5, 2.5, 0, TAU);
  ctx.arc(x + 7, y - 5, 2.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7b2f2f";
  ctx.beginPath();
  ctx.arc(x, y + 3, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

function drawArc(ctx, cx, cy, t) {
  const targets = [
    { x: cx + 88, y: cy - 44 },
    { x: cx + 132, y: cy + 20 },
    { x: cx + 56, y: cy + 58 },
  ];
  let from = { x: cx, y: cy };
  for (const to of targets) {
    drawDummy(ctx, to.x, to.y, "#42e8ff");
    lightning(ctx, from.x, from.y, to.x, to.y, t);
    from = to;
  }
}

function drawIce(ctx, cx, cy, t) {
  for (let i = 0; i < 3; i++) {
    const a = -0.4 + i * 0.4 + Math.sin(t * 1.7) * 0.08;
    const x = cx + Math.cos(a) * (64 + i * 22);
    const y = cy + Math.sin(a) * (64 + i * 22);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    glow(ctx, 0, 0, 15, "#9ff4ff", 0.42);
    crystal(ctx, 15);
    ctx.restore();
  }
}

function drawMissile(ctx, cx, cy, t) {
  const a = -0.25 + Math.sin(t * 2) * 0.12;
  const x = cx + Math.cos(a) * 86;
  const y = cy + Math.sin(a) * 86;
  const tx = x - Math.cos(a) * 54;
  const ty = y - Math.sin(a) * 54;
  const grad = ctx.createLinearGradient(tx, ty, x, y);
  grad.addColorStop(0, "rgba(255,77,109,0)");
  grad.addColorStop(1, "#ffb347");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  missile(ctx, 6);
  ctx.restore();
  drawExplosion(ctx, cx + 128, cy - 34, 30 + Math.sin(t * 7) * 5);
}

function drawBoomerang(ctx, cx, cy, t) {
  for (let i = 0; i < 2; i++) {
    const a = t * 1.9 + i * Math.PI;
    const x = cx + Math.cos(a) * 94;
    const y = cy + Math.sin(a) * 42;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 12);
    glow(ctx, 0, 0, 18, "#ff65d8", 0.45);
    starBlade(ctx, 16);
    ctx.restore();
  }
}

function drawDrones(ctx, cx, cy, t) {
  for (let i = 0; i < 3; i++) {
    const a = t * 1.6 + i * TAU / 3;
    const attack = i === 0;
    const r = attack ? 104 : 58;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.65;
    drone(ctx, x, y, t + i, attack);
    if (attack) {
      ctx.strokeStyle = "rgba(119,255,138,0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 14, y);
      ctx.lineTo(x + 54, y - 14);
      ctx.stroke();
    }
  }
}

function drawDummy(ctx, x, y, color) {
  glow(ctx, x, y, 17, color, 0.25);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x - 10, y - 10, 20, 20);
  ctx.strokeStyle = color;
  ctx.strokeRect(x - 10, y - 10, 20, 20);
}

function lightning(ctx, x1, y1, x2, y2, t) {
  const steps = 7;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 5;
  stroke();
  ctx.strokeStyle = "#42e8ff";
  ctx.lineWidth = 2;
  stroke();
  ctx.lineCap = "butt";

  function stroke() {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const off = i === 0 || i === steps ? 0 : Math.sin(t * 20 + i * 2.8) * 9;
      const x = x1 + dx * k + nx * off;
      const y = y1 + dy * k + ny * off;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function crystal(ctx, r) {
  ctx.fillStyle = "#dffcff";
  ctx.beginPath();
  ctx.moveTo(r * 1.8, 0);
  ctx.lineTo(r * 0.3, r * 0.8);
  ctx.lineTo(-r * 0.9, r * 0.25);
  ctx.lineTo(-r * 1.1, 0);
  ctx.lineTo(-r * 0.9, -r * 0.25);
  ctx.lineTo(r * 0.3, -r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#9ff4ff";
  ctx.stroke();
}

function missile(ctx, r) {
  ctx.fillStyle = "#fff1c4";
  ctx.beginPath();
  ctx.moveTo(r * 3.1, 0);
  ctx.lineTo(r * 0.7, r * 1.2);
  ctx.lineTo(-r * 2, r * 0.8);
  ctx.lineTo(-r * 2.4, 0);
  ctx.lineTo(-r * 2, -r * 0.8);
  ctx.lineTo(r * 0.7, -r * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ff7a2f";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function starBlade(ctx, r) {
  ctx.fillStyle = "#ff65d8";
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4;
    const rr = i % 2 ? r * 0.5 : r * 1.55;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

function drone(ctx, x, y, t, attacking) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 8) * 2);
  glow(ctx, 0, 0, 20, attacking ? "#77ff8a" : "#ffd166", attacking ? 0.5 : 0.34);
  ctx.fillStyle = "rgba(10,16,28,0.95)";
  ctx.strokeStyle = attacking ? "#77ff8a" : "#42e8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-13, -8, 26, 16, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = attacking ? "#77ff8a" : "#ffd166";
  ctx.fillRect(-4, -3, 8, 6);
  for (const sx of [-18, 18]) {
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx, 0, 5 + Math.sin(t * 18) * 1.2, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExplosion(ctx, x, y, r) {
  glow(ctx, x, y, r, "#ffb347", 0.34);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = "#ffb347";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
}

function glow(ctx, x, y, r, color, alpha) {
  ctx.fillStyle = colorWithAlpha(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, TAU);
  ctx.fill();
}

function colorWithAlpha(hex, alpha) {
  const c = hex.replace("#", "");
  const n = Number.parseInt(c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
