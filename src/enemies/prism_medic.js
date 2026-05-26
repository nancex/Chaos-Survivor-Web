import { TAU, WORLD_SIZE } from "../constants.js";
import { state, world } from "../state.js";
import { particle, pulse, trail } from "../effects.js";
import { clamp, distSq } from "../utils.js";
import { BaseEnemy } from "./BaseEnemy.js";

const HEAL_RANGE = 290;
const KEEP_DISTANCE = 380;

export class PrismMedic extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    this.behavior = "prism_medic";
    this.cooldown = 0.65 + Math.random() * 0.5;
    this.channel = 0;
    this.target = null;
    this.orbit = Math.random() * TAU;
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.28);
  }

  update(dt) {
    const p = state.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.anim += dt * 4.8;
    this.orbit += dt * 3.5;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.flip = dx < 0 ? -1 : 1;

    this.target = this.findTarget();
    if (this.target && this.cooldown <= 0 && this.channel <= 0) this.channel = 1.05;

    if (this.channel > 0 && this.target && !this.target.dead) {
      this.channel -= dt;
      this.target.hp = Math.min(this.target.maxHp, this.target.hp + (24 + state.wave * 2.5) * dt);
      this.target.flash = Math.max(this.target.flash, 0.18);
      trail(this.x, this.y, this.target.x, this.target.y, this.color, 3);
      if (Math.random() < dt * 8) particle("mote", this.target.x, this.target.y, { color: this.color, life: 0.36, size: 3, alpha: 0.8 });
      if (this.channel <= 0) {
        this.cooldown = 2.25;
        pulse(this.target.x, this.target.y, 42, this.color, 0.2);
      }
      this.move(dx, dy, d, dt, d < KEEP_DISTANCE ? -0.8 : 0.08);
    } else {
      this.channel = 0;
      this.move(dx, dy, d, dt, d < KEEP_DISTANCE ? -0.9 : 0.25);
    }

    const half = WORLD_SIZE / 2;
    this.x = clamp(this.x, -half + this.r, half - this.r);
    this.y = clamp(this.y, -half + this.r, half - this.r);
  }

  move(dx, dy, d, dt, dir) {
    const strafe = Math.sin(this.anim * 0.58) * 0.42;
    this.x += (dx / d * dir + -dy / d * strafe) * this.speed * dt;
    this.y += (dy / d * dir + dx / d * strafe) * this.speed * dt;
  }

  findTarget() {
    let best = null;
    let bestScore = 0;
    const range2 = HEAL_RANGE * HEAL_RANGE;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.boss || e.hp >= e.maxHp) continue;
      if (distSq(this.x, this.y, e.x, e.y) > range2) continue;
      const missing = 1 - e.hp / Math.max(1, e.maxHp);
      const score = missing * (e.elite ? 1.6 : 1);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  draw(ctx) {
    const flash = this.flash > 0;
    const z = this.r / 15;
    const bob = Math.sin(this.anim * 1.55) * 3;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 8 - bob, this.r, this.r * 0.22, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = flash ? "#ffffff" : "#eafff5";
    ctx.strokeStyle = flash ? "#ffffff" : this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18 * z);
    ctx.lineTo(14 * z, 0);
    ctx.lineTo(0, 18 * z);
    ctx.lineTo(-14 * z, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? "#ffffff" : "#134e3a";
    ctx.fillRect(-3 * z, -11 * z, 6 * z, 22 * z);
    ctx.fillRect(-10 * z, -3 * z, 20 * z, 6 * z);

    for (let i = 0; i < 4; i++) {
      const a = this.orbit + i * TAU / 4;
      const x = Math.cos(a) * 25 * z;
      const y = Math.sin(a) * 14 * z;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = flash ? "#ffffff" : this.color;
      ctx.fillRect(-4 * z, -2 * z, 8 * z, 4 * z);
      ctx.restore();
    }
    if (this.channel > 0 && this.target) {
      ctx.strokeStyle = "rgba(114,255,180,0.74)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(this.target.x - this.x, this.target.y - this.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
