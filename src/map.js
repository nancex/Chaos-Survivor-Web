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
  const floorDecals = [];
  const cableRuns = [];
  const fogBanks = [];

  for (let y = -half; y < half; y += tileSize) {
    for (let x = -half; x < half; x += tileSize) {
      const color = palette.floor[Math.floor(rng() * palette.floor.length)];
      const accent = palette.accent[Math.floor(rng() * palette.accent.length)];
      const panel = rng() > 0.34;
      const grate = rng() > 0.68;
      const crack = rng() > 0.72;
      const glow = rng() > 0.82 ? accent : null;
      const trim = rng() > 0.56;
      const stain = rng() > 0.74;
      const node = rng() > 0.9 ? accent : null;
      tiles.push({
        x, y, color, accent,
        panel, grate, crack, glow,
        trim, stain, node,
        rot: Math.floor(rng() * 4),
        detail: rng(),
        detailKind: Math.floor(rng() * 5),
        edgeWear: rng(),
        phase: rng() * TAU,
      });

      if (rng() > 0.84) {
        props.push(createProp(rng, x + 18 + rng() * 92, y + 18 + rng() * 92, palette));
      }
      if (rng() > 0.86) {
        floorDecals.push(createFloorDecal(rng, x, y, tileSize, palette));
      }
      if (rng() > 0.955) {
        cableRuns.push(createCableRun(rng, x, y, tileSize, palette));
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

  return { tileSize, palette, tiles, props, energyLines, floorDecals, cableRuns, fogBanks };
}

export function drawMap(ctx, map, camX, camY, viewW, viewH, time) {
  if (!map) return;
  drawBase(ctx, map, camX, camY, viewW, viewH, time);
  drawTiles(ctx, map, camX, camY, viewW, viewH, time);
  drawFloorDecals(ctx, map, camX, camY, viewW, viewH, time);
  drawCableRuns(ctx, map, camX, camY, viewW, viewH, time);
  drawEnergyLines(ctx, map, camX, camY, viewW, viewH, time);
  drawGrid(ctx, map, camX, camY, viewW, viewH, time);
  drawProps(ctx, map, camX, camY, viewW, viewH, time);
  drawFog(ctx, map, camX, camY, viewW, viewH, time);
}

function createProp(rng, x, y, palette) {
  const roll = rng();
  const kind = roll > 0.86 ? "beacon" : roll > 0.72 ? "dataCore" : roll > 0.58 ? "pylon" : roll > 0.42 ? "crystalCluster" : roll > 0.24 ? "relayPad" : roll > 0.12 ? "conduit" : "rubble";
  return {
    x, y, kind,
    size: 12 + rng() * 28,
    color: palette.accent[Math.floor(rng() * palette.accent.length)],
    alt: palette.accent[Math.floor(rng() * palette.accent.length)],
    phase: rng() * TAU,
    rot: rng() * TAU,
  };
}

function createFloorDecal(rng, x, y, size, palette) {
  return {
    x: x + 18 + rng() * (size - 36),
    y: y + 18 + rng() * (size - 36),
    kind: Math.floor(rng() * 5),
    w: 26 + rng() * 54,
    h: 16 + rng() * 42,
    color: palette.accent[Math.floor(rng() * palette.accent.length)],
    phase: rng() * TAU,
    rot: Math.floor(rng() * 4) * Math.PI / 2,
  };
}

function createCableRun(rng, x, y, size, palette) {
  const horizontal = rng() > 0.5;
  const bend = rng() > 0.45;
  const length = 96 + rng() * 104;
  const ox = x + size * (0.25 + rng() * 0.5);
  const oy = y + size * (0.25 + rng() * 0.5);
  return {
    x: ox,
    y: oy,
    horizontal,
    bend,
    length,
    color: palette.accent[Math.floor(rng() * palette.accent.length)],
    phase: rng() * TAU,
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

    if (tile.stain) drawTileStain(ctx, tile, map.tileSize);
    if (tile.panel) drawPanel(ctx, tile, map.tileSize, time);
    if (tile.grate) drawGrate(ctx, tile, map.tileSize);
    if (tile.trim) drawTileTrim(ctx, tile, map.tileSize);
    drawMicroDetails(ctx, tile, map.tileSize);
    if (tile.glow) drawTileGlow(ctx, tile, map.tileSize, time);
    if (tile.node) drawTileNode(ctx, tile, map.tileSize, time);
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

function drawTileStain(ctx, tile, size) {
  const w = 26 + tile.edgeWear * 42;
  const h = 18 + (1 - tile.edgeWear) * 34;
  const x = tile.x + 18 + tile.detail * (size - 58);
  const y = tile.y + 18 + Math.abs(Math.sin(tile.phase)) * (size - 58);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hexToRgba(tile.accent, 0.035);
  ctx.fillRect(x + 5, y + 4, w * 0.55, h * 0.42);
}

function drawTileTrim(ctx, tile, size) {
  const len = 22 + tile.edgeWear * 24;
  const inset = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tile.x + inset, tile.y + inset + len);
  ctx.lineTo(tile.x + inset, tile.y + inset);
  ctx.lineTo(tile.x + inset + len, tile.y + inset);
  ctx.moveTo(tile.x + size - inset - len, tile.y + size - inset);
  ctx.lineTo(tile.x + size - inset, tile.y + size - inset);
  ctx.lineTo(tile.x + size - inset, tile.y + size - inset - len);
  if (tile.rot % 2) {
    ctx.moveTo(tile.x + size - inset - len * 0.72, tile.y + inset);
    ctx.lineTo(tile.x + size - inset, tile.y + inset);
    ctx.lineTo(tile.x + size - inset, tile.y + inset + len * 0.72);
  }
  ctx.stroke();
}

function drawMicroDetails(ctx, tile, size) {
  const x = tile.x;
  const y = tile.y;
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  for (let i = 0; i < 3; i++) {
    const px = x + 18 + ((tile.detail * 97 + i * 29 + tile.detailKind * 13) % (size - 36));
    const py = y + 18 + ((tile.edgeWear * 103 + i * 37 + tile.rot * 17) % (size - 36));
    ctx.fillRect(px, py, 3, 3);
  }

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  if (tile.detailKind === 1) {
    ctx.strokeRect(x + 44, y + 30, 38, 18);
  } else if (tile.detailKind === 2) {
    ctx.beginPath();
    ctx.moveTo(x + 30, y + 90);
    ctx.lineTo(x + 58, y + 90);
    ctx.moveTo(x + 70, y + 90);
    ctx.lineTo(x + 98, y + 90);
    ctx.stroke();
  } else if (tile.detailKind === 3) {
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.fillRect(x + 88, y + 18, 18, 18);
    ctx.fillRect(x + 96, y + 28, 10, 30);
  } else if (tile.detailKind === 4) {
    ctx.strokeStyle = hexToRgba(tile.accent, 0.08);
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 18);
    ctx.lineTo(x + 42, y + 18);
    ctx.lineTo(x + 42, y + 42);
    ctx.stroke();
  }
}

function drawTileNode(ctx, tile, size, time) {
  const cx = tile.x + size * (0.33 + (tile.rot % 2) * 0.34);
  const cy = tile.y + size * (0.38 + (tile.rot > 1 ? 0.22 : 0));
  const pulse = 0.34 + Math.max(0, Math.sin(time * 2.8 + tile.phase)) * 0.38;
  ctx.fillStyle = hexToRgba(tile.node, 0.16 * pulse);
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(tile.node, 0.36 + pulse * 0.18);
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 6, cy - 6, 12, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
}

function drawFloorDecals(ctx, map, camX, camY, viewW, viewH, time) {
  for (const decal of map.floorDecals || []) {
    if (!rectVisible(decal.x - decal.w, decal.y - decal.h, decal.w * 2, decal.h * 2, camX, camY, viewW, viewH, 80)) continue;
    ctx.save();
    ctx.translate(decal.x, decal.y);
    ctx.rotate(decal.rot);
    if (decal.kind === 0) drawVentDecal(ctx, decal);
    else if (decal.kind === 1) drawHazardDecal(ctx, decal, time);
    else if (decal.kind === 2) drawHatchDecal(ctx, decal);
    else if (decal.kind === 3) drawArrowDecal(ctx, decal);
    else drawCircuitDecal(ctx, decal, time);
    ctx.restore();
  }
}

function drawVentDecal(ctx, decal) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(-decal.w * 0.5, -decal.h * 0.5, decal.w, decal.h);
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-decal.w * 0.5, -decal.h * 0.5, decal.w, decal.h);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let x = -decal.w * 0.38; x < decal.w * 0.42; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, -decal.h * 0.4);
    ctx.lineTo(x - 10, decal.h * 0.4);
    ctx.stroke();
  }
}

function drawHazardDecal(ctx, decal, time) {
  const pulse = 0.12 + Math.max(0, Math.sin(time * 2 + decal.phase)) * 0.1;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(-decal.w * 0.5, -decal.h * 0.5, decal.w, decal.h);
  for (let x = -decal.w; x < decal.w; x += 14) {
    ctx.fillStyle = hexToRgba(decal.color, pulse);
    ctx.beginPath();
    ctx.moveTo(x, -decal.h * 0.5);
    ctx.lineTo(x + 8, -decal.h * 0.5);
    ctx.lineTo(x + 2, decal.h * 0.5);
    ctx.lineTo(x - 6, decal.h * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHatchDecal(ctx, decal) {
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-decal.w * 0.44, -decal.w * 0.44, decal.w * 0.88, decal.w * 0.88);
  ctx.strokeStyle = hexToRgba(decal.color, 0.12);
  ctx.strokeRect(-decal.w * 0.28, -decal.w * 0.28, decal.w * 0.56, decal.w * 0.56);
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.fillRect(-decal.w * 0.16, -decal.w * 0.16, decal.w * 0.32, decal.w * 0.32);
}

function drawArrowDecal(ctx, decal) {
  ctx.fillStyle = hexToRgba(decal.color, 0.12);
  for (let i = 0; i < 2; i++) {
    const off = i * 18 - 8;
    ctx.beginPath();
    ctx.moveTo(off - 10, -10);
    ctx.lineTo(off + 4, 0);
    ctx.lineTo(off - 10, 10);
    ctx.lineTo(off - 5, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCircuitDecal(ctx, decal, time) {
  const pulse = 0.12 + Math.max(0, Math.sin(time * 2.6 + decal.phase)) * 0.16;
  ctx.strokeStyle = hexToRgba(decal.color, pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-decal.w * 0.42, 0);
  ctx.lineTo(-decal.w * 0.12, 0);
  ctx.lineTo(-decal.w * 0.02, -decal.h * 0.35);
  ctx.lineTo(decal.w * 0.38, -decal.h * 0.35);
  ctx.moveTo(-decal.w * 0.02, 0);
  ctx.lineTo(decal.w * 0.28, decal.h * 0.32);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(decal.color, pulse + 0.08);
  ctx.fillRect(decal.w * 0.32, -decal.h * 0.42, 5, 5);
  ctx.fillRect(decal.w * 0.24, decal.h * 0.25, 5, 5);
}

function drawCableRuns(ctx, map, camX, camY, viewW, viewH, time) {
  for (const cable of map.cableRuns || []) {
    if (!rectVisible(cable.x - cable.length, cable.y - cable.length, cable.length * 2, cable.length * 2, camX, camY, viewW, viewH, 100)) continue;
    const dir = cable.horizontal ? 0 : Math.PI / 2;
    const pulse = 0.18 + Math.max(0, Math.sin(time * 3.2 + cable.phase)) * 0.26;
    ctx.save();
    ctx.translate(cable.x, cable.y);
    ctx.rotate(dir);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-cable.length * 0.5, 0);
    if (cable.bend) {
      ctx.lineTo(0, 0);
      ctx.lineTo(0, cable.length * 0.32);
      ctx.lineTo(cable.length * 0.44, cable.length * 0.32);
    } else {
      ctx.lineTo(cable.length * 0.5, 0);
    }
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(cable.color, pulse);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.11)";
    ctx.fillRect(-8, -8, 16, 16);
    ctx.lineCap = "butt";
    ctx.restore();
  }
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
    else if (prop.kind === "dataCore") drawDataCore(ctx, prop, time);
    else if (prop.kind === "relayPad") drawRelayPad(ctx, prop, time);
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

function drawDataCore(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.62 + Math.sin(time * 2.8 + prop.phase) * 0.24;
  glow(ctx, 0, 0, s * 1.85, prop.color, 0.12 * pulse);
  ctx.fillStyle = "rgba(3,6,12,0.72)";
  ctx.fillRect(-s * 0.78, -s * 0.58, s * 1.56, s * 1.16);
  ctx.strokeStyle = hexToRgba(prop.color, 0.42 + pulse * 0.16);
  ctx.lineWidth = 2;
  ctx.strokeRect(-s * 0.78, -s * 0.58, s * 1.56, s * 1.16);

  ctx.fillStyle = hexToRgba(prop.color, 0.22 + pulse * 0.12);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-s * 0.52 + i * s * 0.36, -s * 0.28, s * 0.18, s * 0.56);
  }

  ctx.strokeStyle = hexToRgba(prop.alt, 0.32);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = time * 0.8 + prop.phase + i * TAU / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.72);
    ctx.lineTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 0.98);
    ctx.stroke();
  }
}

function drawRelayPad(ctx, prop, time) {
  const s = prop.size;
  const pulse = 0.48 + Math.max(0, Math.sin(time * 3.5 + prop.phase)) * 0.36;
  glow(ctx, 0, 0, s * 1.35, prop.color, 0.08 * pulse);
  ctx.fillStyle = "rgba(3,6,12,0.5)";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.08, s * 0.54, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(prop.color, 0.32 + pulse * 0.22);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.86, s * 0.42, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.58, time + prop.phase, time + prop.phase + Math.PI * 0.9);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-2, -2, 4, 4);
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
    drawFogBank(ctx, fog, time);
  }
}

function drawFogBank(ctx, fog, time) {
  ctx.save();
  ctx.translate(fog.x + Math.sin(time * 0.18 + fog.phase) * 22, fog.y + Math.cos(time * 0.13 + fog.phase) * 18);
  ctx.rotate(Math.sin(fog.phase) * 0.32);
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 5; i++) {
    const a = fog.phase + i * 1.73;
    const drift = Math.sin(time * (0.11 + i * 0.025) + a);
    const ox = Math.cos(a) * fog.rx * (0.08 + i * 0.025) + drift * 18;
    const oy = Math.sin(a * 1.4) * fog.ry * 0.22 + Math.cos(time * 0.09 + a) * 12;
    const rx = fog.rx * (0.34 + i * 0.075);
    const ry = fog.ry * (0.28 + (4 - i) * 0.045);
    const alpha = fog.alpha * (0.42 - i * 0.04);
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, Math.max(rx, ry));
    grad.addColorStop(0, hexToRgba(fog.color, alpha));
    grad.addColorStop(0.58, hexToRgba(fog.color, alpha * 0.32));
    grad.addColorStop(1, hexToRgba(fog.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, Math.sin(a) * 0.38, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
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
