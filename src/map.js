import { WORLD_SIZE, TAU } from "./constants.js";
import { mulberry32, hexToRgba } from "./utils.js";

export function generateMap() {
  const palettes = [
    {
      base: "#07111d",
      floor: ["#0b1d2a", "#102d36", "#162f3f", "#0f2931"],
      dark: "#040811",
      line: "#42e8ff",
      accent: ["#42e8ff", "#77ff8a", "#ffd166", "#b48cff"],
    },
    {
      base: "#110d1f",
      floor: ["#18162c", "#20244a", "#2a2340", "#192c44"],
      dark: "#070512",
      line: "#b48cff",
      accent: ["#b48cff", "#42e8ff", "#ff4d6d", "#ffd166"],
    },
    {
      base: "#071b17",
      floor: ["#0e2825", "#173832", "#214132", "#162b38"],
      dark: "#030b0d",
      line: "#77ff8a",
      accent: ["#77ff8a", "#42e8ff", "#ffd166", "#ff65d8"],
    },
  ];
  const palette = palettes[Math.floor(Math.random() * palettes.length)];
  const rng = mulberry32(Math.floor(Math.random() * 2147483647));
  const tileSize = 128;
  const half = WORLD_SIZE / 2;
  const tiles = [];
  const props = [];
  const energyLines = [];
  const fogBanks = [];

  for (let y = -half; y < half; y += tileSize) {
    for (let x = -half; x < half; x += tileSize) {
      const color = palette.floor[Math.floor(rng() * palette.floor.length)];
      const accent = palette.accent[Math.floor(rng() * palette.accent.length)];
      const panel = rng() > 0.34;
      const grate = rng() > 0.68;
      const crack = rng() > 0.72;
      const glow = rng() > 0.82 ? accent : null;
      tiles.push({
        x, y, color, accent,
        panel, grate, crack, glow,
        rot: Math.floor(rng() * 4),
        detail: rng(),
        phase: rng() * TAU,
      });

      if (rng() > 0.84) {
        props.push(createProp(rng, x + 18 + rng() * 92, y + 18 + rng() * 92, palette));
      }
      if (rng() > 0.94) {
        energyLines.push(createEnergyLine(rng, x + tileSize / 2, y + tileSize / 2, palette));
      }
    }
  }

  for (let i = 0; i < 18; i++) {
    fogBanks.push({
      x: -half + rng() * WORLD_SIZE,
      y: -half + rng() * WORLD_SIZE,
      rx: 220 + rng() * 420,
      ry: 90 + rng() * 180,
      color: palette.accent[Math.floor(rng() * palette.accent.length)],
      alpha: 0.025 + rng() * 0.035,
      phase: rng() * TAU,
    });
  }

  return { tileSize, palette, tiles, props, energyLines, fogBanks };
}

export function drawMap(ctx, map, camX, camY, viewW, viewH, time) {
  if (!map) return;
  drawBase(ctx, map, camX, camY, viewW, viewH, time);
  drawTiles(ctx, map, camX, camY, viewW, viewH, time);
  drawEnergyLines(ctx, map, camX, camY, viewW, viewH, time);
  drawGrid(ctx, map, camX, camY, viewW, viewH, time);
  drawProps(ctx, map, camX, camY, viewW, viewH, time);
  drawFog(ctx, map, camX, camY, viewW, viewH, time);
}

function createProp(rng, x, y, palette) {
  const roll = rng();
  const kind = roll > 0.78 ? "beacon" : roll > 0.58 ? "pylon" : roll > 0.38 ? "crystalCluster" : roll > 0.18 ? "conduit" : "rubble";
  return {
    x, y, kind,
    size: 12 + rng() * 28,
    color: palette.accent[Math.floor(rng() * palette.accent.length)],
    alt: palette.accent[Math.floor(rng() * palette.accent.length)],
    phase: rng() * TAU,
    rot: rng() * TAU,
  };
}

function createEnergyLine(rng, x, y, palette) {
  const horizontal = rng() > 0.5;
  const length = 160 + rng() * 360;
  return {
    x1: x - (horizontal ? length / 2 : 0),
    y1: y - (horizontal ? 0 : length / 2),
    x2: x + (horizontal ? length / 2 : 0),
    y2: y + (horizontal ? 0 : length / 2),
    color: palette.accent[Math.floor(rng() * palette.accent.length)],
    phase: rng() * TAU,
  };
}

function drawBase(ctx, map, camX, camY, viewW, viewH, time) {
  const g = ctx.createLinearGradient(camX, camY, camX + viewW, camY + viewH);
  g.addColorStop(0, map.palette.dark);
  g.addColorStop(0.45, map.palette.base);
  g.addColorStop(1, "#03060d");
  ctx.fillStyle = g;
  ctx.fillRect(camX, camY, viewW, viewH);

  ctx.fillStyle = hexToRgba(map.palette.line, 0.035 + Math.sin(time * 0.7) * 0.012);
  ctx.fillRect(camX, camY, viewW, viewH);
}

function drawTiles(ctx, map, camX, camY, viewW, viewH, time) {
  const pad = map.tileSize;
  for (const tile of map.tiles) {
    if (!rectVisible(tile.x, tile.y, map.tileSize, map.tileSize, camX, camY, viewW, viewH, pad)) continue;
    ctx.fillStyle = tile.color;
    ctx.fillRect(tile.x, tile.y, map.tileSize, map.tileSize);

    ctx.fillStyle = tile.detail > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(tile.x + 8, tile.y + 8, map.tileSize - 16, map.tileSize - 16);

    if (tile.panel) drawPanel(ctx, tile, map.tileSize, time);
    if (tile.grate) drawGrate(ctx, tile, map.tileSize);
    if (tile.glow) drawTileGlow(ctx, tile, map.tileSize, time);
    if (tile.crack) drawCrack(ctx, tile, map.tileSize);
  }
}

function drawPanel(ctx, tile, size, time) {
  const inset = 14 + (tile.rot % 2) * 6;
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  ctx.strokeRect(tile.x + inset, tile.y + inset, size - inset * 2, size - inset * 2);

  const pulse = 0.16 + Math.max(0, Math.sin(time * 1.6 + tile.phase)) * 0.14;
  ctx.strokeStyle = hexToRgba(tile.accent, pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (tile.rot % 2 === 0) {
    ctx.moveTo(tile.x + 22, tile.y + size - 24);
    ctx.lineTo(tile.x + size * 0.45, tile.y + size - 24);
    ctx.lineTo(tile.x + size - 22, tile.y + size * 0.42);
  } else {
    ctx.moveTo(tile.x + size - 22, tile.y + 24);
    ctx.lineTo(tile.x + size * 0.58, tile.y + 24);
    ctx.lineTo(tile.x + 22, tile.y + size * 0.58);
  }
  ctx.stroke();
}

function drawGrate(ctx, tile, size) {
  ctx.strokeStyle = "rgba(3,6,12,0.34)";
  ctx.lineWidth = 2;
  const x = tile.x + 22;
  const y = tile.y + 22;
  const w = size - 44;
  for (let i = 0; i < 5; i++) {
    const yy = y + i * 13;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy + (tile.rot % 2 ? 8 : -8));
    ctx.stroke();
  }
}

function drawTileGlow(ctx, tile, size, time) {
  const alpha = 0.24 + Math.sin(time * 2 + tile.phase) * 0.09;
  ctx.strokeStyle = hexToRgba(tile.glow, alpha);
  ctx.lineWidth = 2;
  ctx.strokeRect(tile.x + 5, tile.y + 5, size - 10, size - 10);
  ctx.fillStyle = hexToRgba(tile.glow, alpha * 0.14);
  ctx.fillRect(tile.x + 8, tile.y + 8, size - 16, size - 16);
}

function drawCrack(ctx, tile, size) {
  ctx.strokeStyle = "rgba(3,6,12,0.42)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tile.x + 18, tile.y + 20 + tile.detail * 50);
  ctx.lineTo(tile.x + 43, tile.y + 44);
  ctx.lineTo(tile.x + 75, tile.y + 32 + tile.detail * 50);
  ctx.lineTo(tile.x + 106, tile.y + 84);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawEnergyLines(ctx, map, camX, camY, viewW, viewH, time) {
  ctx.lineCap = "round";
  for (const line of map.energyLines) {
    const minX = Math.min(line.x1, line.x2);
    const minY = Math.min(line.y1, line.y2);
    const w = Math.abs(line.x2 - line.x1) || 20;
    const h = Math.abs(line.y2 - line.y1) || 20;
    if (!rectVisible(minX, minY, w, h, camX, camY, viewW, viewH, 120)) continue;
    const k = 0.35 + Math.max(0, Math.sin(time * 3 + line.phase)) * 0.45;
    ctx.strokeStyle = hexToRgba(line.color, 0.12);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(line.color, k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawGrid(ctx, map, camX, camY, viewW, viewH, time) {
  const step = 64;
  const startX = Math.floor(camX / step) * step;
  const startY = Math.floor(camY / step) * step;
  ctx.strokeStyle = hexToRgba(map.palette.line, 0.055 + Math.sin(time * 0.8) * 0.015);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x < camX + viewW + step; x += step) {
    ctx.moveTo(x, camY - step);
    ctx.lineTo(x, camY + viewH + step);
  }
  for (let y = startY; y < camY + viewH + step; y += step) {
    ctx.moveTo(camX - step, y);
    ctx.lineTo(camX + viewW + step, y);
  }
  ctx.stroke();
}

function drawProps(ctx, map, camX, camY, viewW, viewH, time) {
  for (const prop of map.props) {
    if (!rectVisible(prop.x - 80, prop.y - 80, 160, 160, camX, camY, viewW, viewH, 80)) continue;
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.rot);
    if (prop.kind === "crystalCluster") drawCrystalCluster(ctx, prop, time);
    else if (prop.kind === "pylon") drawPylon(ctx, prop, time);
    else if (prop.kind === "beacon") drawBeacon(ctx, prop, time);
    else if (prop.kind === "conduit") drawConduit(ctx, prop, time);
    else drawRubble(ctx, prop);
    ctx.restore();
  }
}

function drawCrystalCluster(ctx, prop, time) {
  const pulse = 0.7 + Math.sin(time * 2.4 + prop.phase) * 0.22;
  glow(ctx, 0, 0, prop.size * 1.5, prop.color, 0.12 * pulse);
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + 0.4;
    const r = prop.size * (0.45 + i * 0.12);
    ctx.save();
    ctx.translate(Math.cos(a) * prop.size * 0.24, Math.sin(a) * prop.size * 0.18);
    ctx.rotate(a);
    ctx.fillStyle = hexToRgba(prop.color, 0.36);
    diamond(ctx, r + 8);
    ctx.fillStyle = i % 2 ? prop.alt : prop.color;
    diamond(ctx, r);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPylon(ctx, prop, time) {
  const s = prop.size;
  glow(ctx, 0, 0, s * 1.8, prop.color, 0.1 + Math.max(0, Math.sin(time * 3 + prop.phase)) * 0.12);
  ctx.fillStyle = "rgba(3,6,12,0.54)";
  ctx.fillRect(-s * 0.48, s * 0.34, s * 0.96, s * 0.24);
  ctx.fillStyle = "rgba(10,16,28,0.92)";
  ctx.fillRect(-s * 0.32, -s * 0.9, s * 0.64, s * 1.3);
  ctx.strokeStyle = prop.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.32, -s * 0.9, s * 0.64, s * 1.3);
  ctx.fillStyle = prop.color;
  ctx.fillRect(-s * 0.14, -s * 0.58, s * 0.28, s * 0.68);
}

function drawBeacon(ctx, prop, time) {
  const s = prop.size;
  const spin = time * 1.8 + prop.phase;
  glow(ctx, 0, 0, s * 2, prop.color, 0.16);
  ctx.strokeStyle = hexToRgba(prop.color, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.78, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = spin + i * TAU / 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35);
    ctx.lineTo(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.15);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.fillStyle = prop.color;
  diamond(ctx, s * 0.34);
}

function drawConduit(ctx, prop, time) {
  const s = prop.size;
  ctx.strokeStyle = "rgba(3,6,12,0.55)";
  ctx.lineWidth = s * 0.42;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 1.4, 0);
  ctx.lineTo(s * 1.4, 0);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(prop.color, 0.34 + Math.max(0, Math.sin(time * 4 + prop.phase)) * 0.28);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5);
}

function drawRubble(ctx, prop) {
  const s = prop.size;
  ctx.fillStyle = "rgba(3,6,12,0.5)";
  ctx.fillRect(-s * 0.75, -s * 0.34, s * 1.5, s * 0.68);
  ctx.fillStyle = hexToRgba(prop.color, 0.24);
  ctx.fillRect(-s * 0.48, -s * 0.2, s * 0.78, s * 0.38);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(s * 0.1, -s * 0.4, s * 0.46, s * 0.26);
}

function drawFog(ctx, map, camX, camY, viewW, viewH, time) {
  for (const fog of map.fogBanks) {
    if (!rectVisible(fog.x - fog.rx, fog.y - fog.ry, fog.rx * 2, fog.ry * 2, camX, camY, viewW, viewH, 120)) continue;
    ctx.save();
    ctx.translate(fog.x + Math.sin(time * 0.18 + fog.phase) * 22, fog.y + Math.cos(time * 0.13 + fog.phase) * 18);
    ctx.rotate(Math.sin(fog.phase) * 0.5);
    ctx.fillStyle = hexToRgba(fog.color, fog.alpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, fog.rx, fog.ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function rectVisible(x, y, w, h, camX, camY, viewW, viewH, pad = 0) {
  return x <= camX + viewW + pad && x + w >= camX - pad && y <= camY + viewH + pad && y + h >= camY - pad;
}

function glow(ctx, x, y, r, color, alpha) {
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function diamond(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r, 0);
  ctx.closePath();
  ctx.fill();
}
