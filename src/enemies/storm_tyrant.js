import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { burst, pulse, trail } from "../effects.js";
import { clamp } from "../utils.js";
import { playSfx } from "../audio.js";
import { BaseEnemy } from "./BaseEnemy.js";

const MODES = ["fan", "ring", "dash", "summon"];

export class StormTyrant extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.name = "风暴暴君·雷冕核心";
    this.mode = "intro";
    this.modeTimer = 1.0;
    this.attackTimer = 0;
    this.attackCount = 0;
    this.modeIndex = 0;
    this.lockAngle = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.dashTrailTimer = 0;
    this.phase2 = false;
    this.phasePulse = 0;
    this.ringSpin = Math.random() * TAU;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * (this.phase2 ? 4.2 : 3.1);
    this.ringSpin += dt * (this.phase2 ? 1.8 : 1.25);
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.phase2 = this.hp < this.maxHp * 0.45;
    this.phasePulse = Math.max(0, this.phasePulse - dt * 2.8);

    this.updateMode(dt, dx, dy, d);
    this.keepNearArena(dt, dx, dy, d);

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);

    if (d < p.r + this.r && p.invuln <= 0) {
      p.hp -= this.damage;
      p.invuln = 0.65;
      state.shake = 14;
      state.flash = 0.32;
      burst(p.x, p.y, 18, "#42e8ff", 180);
      playSfx("hurt");
    }
  }

  updateMode(dt, dx, dy, d) {
    this.modeTimer -= dt;
    this.attackTimer -= dt;
    if (this.mode === "intro") {
      if (this.modeTimer <= 0) this.chooseMode();
      return;
    }
    if (this.mode === "windup") {
      this.drift(dx, dy, d, -0.18, dt);
      if (this.modeTimer <= 0) this.startAttack();
      return;
    }
    if (this.mode === "fan") return this.updateFan(dt, dx, dy);
    if (this.mode === "ring") return this.updateRing(dt);
    if (this.mode === "dash") return this.updateDash(dt);
    if (this.mode === "summon") return this.updateSummon(dt);
    if (this.mode === "recover") {
      this.drift(dx, dy, d, 0.28, dt);
      if (this.modeTimer <= 0) this.chooseMode();
    }
  }

  chooseMode() {
    this.mode = "windup";
    this.currentAttack = MODES[this.modeIndex % MODES.length];
    this.modeIndex++;
    this.modeTimer = this.currentAttack === "dash" ? 0.74 : this.currentAttack === "summon" ? 0.86 : 0.58;
    this.attackCount = 0;
    this.lockAngle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
    pulse(this.x, this.y, this.r + 28, this.color, 0.24);
  }

  startAttack() {
    this.mode = this.currentAttack;
    this.attackTimer = 0;
    if (this.mode === "fan") this.modeTimer = this.phase2 ? 1.42 : 1.18;
    if (this.mode === "ring") this.modeTimer = this.phase2 ? 1.65 : 1.35;
    if (this.mode === "summon") this.modeTimer = 0.62;
    if (this.mode === "dash") {
      this.modeTimer = 0.38;
      this.dashVx = Math.cos(this.lockAngle) * (this.phase2 ? 690 : 610);
      this.dashVy = Math.sin(this.lockAngle) * (this.phase2 ? 690 : 610);
      burst(this.x, this.y, 16, "#d9fbff", 220);
      playSfx("wave");
    }
  }

  updateFan(dt, dx, dy) {
    this.drift(dx, dy, Math.max(1, Math.hypot(dx, dy)), 0.24, dt);
    if (this.attackTimer <= 0) {
      this.attackTimer = 0.24;
      this.attackCount++;
      const rounds = this.phase2 ? 5 : 3;
      const count = this.phase2 ? 9 : 7;
      const base = Math.atan2(dy, dx) + Math.sin(this.attackCount * 0.9) * 0.13;
      for (let i = 0; i < count; i++) {
        const t = i - (count - 1) / 2;
        this.shoot(base + t * 0.15, 205 + this.attackCount * 9, 6, "stormBlade", this.damage * 0.42);
      }
      playSfx("shoot");
      if (this.attackCount >= rounds) this.recover(0.42);
    }
  }

  updateRing(dt) {
    if (this.attackTimer <= 0) {
      this.attackTimer = this.phase2 ? 0.34 : 0.42;
      this.attackCount++;
      const count = this.phase2 ? 22 : 16;
      const offset = this.ringSpin + this.attackCount * 0.22;
      for (let i = 0; i < count; i++) {
        const gap = this.attackCount % 2 === 0 && i % 7 === 0;
        if (!gap) this.shoot(offset + i / count * TAU, this.phase2 ? 185 : 165, 5.5, "stormOrb", this.damage * 0.36);
      }
      if (this.phase2) {
        for (let i = 0; i < 12; i++) this.shoot(offset * -0.7 + i / 12 * TAU, 125, 4.5, "stormOrb", this.damage * 0.28);
      }
      pulse(this.x, this.y, this.r + this.attackCount * 22, "#42e8ff", 0.18);
      playSfx("shoot");
      if (this.attackCount >= (this.phase2 ? 4 : 3)) this.recover(0.56);
    }
  }

  updateDash(dt) {
    this.x += this.dashVx * dt;
    this.y += this.dashVy * dt;
    this.dashTrailTimer -= dt;
    if (this.dashTrailTimer <= 0) {
      this.dashTrailTimer = 0.045;
      trail(this.x, this.y, this.x - this.dashVx * 0.05, this.y - this.dashVy * 0.05, "#9ff4ff", 16);
      world.hazards.push({ x: this.x, y: this.y, r: 34, color: "#42e8ff", damage: this.damage * 0.32, life: 0.65, maxLife: 0.65 });
    }
    if (this.modeTimer <= 0) {
      if (this.phase2) for (let i = 0; i < 8; i++) this.shoot(i / 8 * TAU, 190, 5, "stormOrb", this.damage * 0.34);
      this.recover(0.68);
    }
  }

  updateSummon() {
    if (this.attackCount === 0) {
      this.attackCount = 1;
      const count = this.phase2 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const a = this.ringSpin + i / count * TAU;
        world.enemies.push(new StormShard(this.x + Math.cos(a) * 105, this.y + Math.sin(a) * 105, this.phase2));
      }
      pulse(this.x, this.y, 130, "#9ff4ff", 0.34);
      playSfx("level");
    }
    if (this.modeTimer <= 0) this.recover(0.76);
  }

  recover(time) {
    this.mode = "recover";
    this.modeTimer = time;
  }

  keepNearArena(dt, dx, dy, d) {
    if (this.mode === "dash") return;
    const desired = 430;
    const dir = d < desired ? -0.34 : 0.22;
    this.drift(dx, dy, d, dir, dt);
  }

  drift(dx, dy, d, power, dt) {
    const orbit = Math.sin(state.time * 1.4) * 0.42;
    this.x += (dx / d * power + -dy / d * orbit) * this.speed * dt;
    this.y += (dy / d * power + dx / d * orbit) * this.speed * dt;
  }

  shoot(angle, speed, radius, shape, damage) {
    world.enemyProjectiles.push({
      x: this.x + Math.cos(angle) * (this.r * 0.75),
      y: this.y + Math.sin(angle) * (this.r * 0.75),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      color: this.phase2 ? "#b48cff" : "#42e8ff",
      damage,
      life: 4.8,
      shape,
      spin: Math.random() * TAU,
    });
  }

  takeDamage(amount, x, y) {
    const wasPhase2 = this.phase2;
    super.takeDamage(amount, x, y);
    if (!wasPhase2 && this.hp > 0 && this.hp < this.maxHp * 0.45) {
      this.phasePulse = 1;
      burst(this.x, this.y, 34, "#b48cff", 260);
      playSfx("wave");
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.anim * 1.4) * 5));
    drawTelegraph(ctx, this);
    drawWings(ctx, this);
    drawRings(ctx, this);
    drawCore(ctx, this);
    drawCrown(ctx, this);
    ctx.restore();
  }
}

class StormShard {
  constructor(x, y, empowered) {
    this.type = "storm_shard";
    this.name = "风暴碎片";
    this.x = x;
    this.y = y;
    this.r = empowered ? 15 : 13;
    this.hp = empowered ? 48 : 34;
    this.maxHp = this.hp;
    this.speed = empowered ? 105 : 88;
    this.damage = empowered ? 12 : 9;
    this.xp = 0;
    this.color = empowered ? "#b48cff" : "#9ff4ff";
    this.dead = false;
    this.flash = 0;
    this.hitTimer = 0;
    this.anim = Math.random() * TAU;
    this.cooldown = 0.7 + Math.random() * 0.4;
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 5;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.x += dx / d * this.speed * dt;
    this.y += dy / d * this.speed * dt;
    if (this.cooldown <= 0 && d < 520) {
      this.cooldown = 1.1;
      const a = Math.atan2(dy, dx);
      world.enemyProjectiles.push({ x: this.x, y: this.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 4, color: this.color, damage: this.damage, life: 3.2, shape: "stormOrb", spin: Math.random() * TAU });
    }
    if (d < p.r + this.r && p.invuln <= 0) {
      p.hp -= this.damage;
      p.invuln = 0.45;
      playSfx("hurt");
    }
  }

  takeDamage(amount, x, y) {
    this.hp -= amount * state.player.damageScale;
    this.flash = 1;
    burst(x, y, 4, this.color, 120);
    if (this.hp <= 0) this.kill();
  }

  kill() {
    this.dead = true;
    const i = world.enemies.indexOf(this);
    if (i >= 0) world.enemies.splice(i, 1);
    burst(this.x, this.y, 10, this.color, 160);
    playSfx("hit");
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.anim);
    ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
    polygon(ctx, 0, 0, this.r, 4, Math.PI / 4, true);
    ctx.strokeStyle = "#e9feff";
    ctx.lineWidth = 2;
    polygon(ctx, 0, 0, this.r + 4, 4, Math.PI / 4, false);
    ctx.restore();
  }
}

function drawTelegraph(ctx, e) {
  if (e.mode !== "windup") return;
  const alpha = 0.35 + Math.sin(e.anim * 9) * 0.16;
  ctx.save();
  if (e.currentAttack === "dash") {
    ctx.rotate(e.lockAngle);
    ctx.strokeStyle = `rgba(159,244,255,${alpha})`;
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(360, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (e.currentAttack === "ring") {
    ctx.strokeStyle = `rgba(66,232,255,${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 30 + Math.sin(e.anim * 8) * 10, 0, TAU);
    ctx.stroke();
  } else {
    ctx.rotate(e.lockAngle);
    ctx.fillStyle = `rgba(66,232,255,${alpha * 0.16})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(280, -72);
    ctx.lineTo(280, 72);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWings(ctx, e) {
  const color = e.phase2 ? "rgba(180,140,255,0.5)" : "rgba(66,232,255,0.48)";
  const flap = Math.sin(e.anim * 2.4) * 9;
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 35, -20);
    ctx.lineTo(side * (92 + flap), -42);
    ctx.lineTo(side * (70 + flap), -5);
    ctx.lineTo(side * (110 + flap), 28);
    ctx.lineTo(side * 34, 18);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRings(ctx, e) {
  const ringColor = e.phase2 ? "#b48cff" : "#42e8ff";
  for (let layer = 0; layer < 2; layer++) {
    ctx.save();
    ctx.rotate(e.ringSpin * (layer ? -1 : 1));
    ctx.strokeStyle = layer ? "rgba(255,255,255,0.62)" : ringColor;
    ctx.lineWidth = layer ? 2 : 3;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      const r = 48 + layer * 13;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + 0.22);
      ctx.stroke();
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      polygon(ctx, x, y, layer ? 4 : 6, 3, a, true);
    }
    ctx.restore();
  }
}

function drawCore(ctx, e) {
  const flash = e.flash > 0;
  const pulseScale = 1 + Math.sin(e.anim * 3) * 0.05 + e.phasePulse * 0.18;
  ctx.save();
  ctx.scale(pulseScale, pulseScale);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, e.r * 0.74, e.r * 0.92, e.r * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = flash ? "#fff" : e.phase2 ? "#b48cff" : "#42e8ff";
  polygon(ctx, 0, 0, e.r * 0.74, 8, Math.PI / 8, true);
  ctx.fillStyle = flash ? "#fff" : "#d9fbff";
  polygon(ctx, 0, 0, e.r * 0.38, 4, Math.PI / 4 + e.ringSpin, true);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  polygon(ctx, 0, 0, e.r * 0.76, 8, Math.PI / 8, false);
  ctx.restore();
}

function drawCrown(ctx, e) {
  ctx.fillStyle = e.phase2 ? "#efe7ff" : "#d9fbff";
  for (let i = -2; i <= 2; i++) {
    const h = i === 0 ? 26 : i % 2 ? 19 : 14;
    ctx.beginPath();
    ctx.moveTo(i * 14, -e.r - h);
    ctx.lineTo(i * 14 + 7, -e.r + 4);
    ctx.lineTo(i * 14 - 7, -e.r + 4);
    ctx.closePath();
    ctx.fill();
  }
}

function polygon(ctx, x, y, r, sides, angle, fill) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = angle + i / sides * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}
