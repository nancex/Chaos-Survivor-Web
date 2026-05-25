(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
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

  const TAU = Math.PI * 2;
  const WORLD_SIZE = 4800;
  const ENEMY_LIMIT = 420;
  const BULLET_LIMIT = 260;
  const GEM_LIMIT = 320;
  const PARTICLE_LIMIT = 280;
  const CELL_SIZE = 128;
  const SAVE_KEY = "pixel-survivor-best";

  let width = 1;
  let height = 1;
  let dpr = 1;
  let lastTime = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let fps = 60;
  let muted = false;
  let audio = null;

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    vx: 0,
    vy: 0,
    pointerId: null,
    stickX: 0,
    stickY: 0,
  };

  const state = {
    mode: "menu",
    time: 0,
    wave: 1,
    kills: 0,
    shards: 0,
    nextSpawn: 0,
    spawnBudget: 0,
    bossSpawned: false,
    victory: false,
    shake: 0,
    flash: 0,
    cameraX: 0,
    cameraY: 0,
    grid: new Map(),
    player: null,
    weapons: null,
    upgrades: [],
  };

  const enemies = [];
  const bullets = [];
  const gems = [];
  const particles = [];

  const enemyPool = [];
  const bulletPool = [];
  const gemPool = [];
  const particlePool = [];

  const UPGRADE_DEFS = [
    {
      id: "bolt",
      icon: "B",
      name: "棱镜电弧",
      desc: "主武器伤害提高，冷却缩短。",
      apply: () => {
        state.weapons.bolt.level++;
        state.weapons.bolt.damage += 7;
        state.weapons.bolt.cooldown = Math.max(0.18, state.weapons.bolt.cooldown * 0.86);
      },
    },
    {
      id: "orbit",
      icon: "O",
      name: "轨道刃环",
      desc: "增加环绕刃数量或提高刃环伤害。",
      apply: () => {
        state.weapons.orbit.level++;
        state.weapons.orbit.count = Math.min(8, state.weapons.orbit.count + 1);
        state.weapons.orbit.damage += 5;
      },
    },
    {
      id: "pulse",
      icon: "P",
      name: "脉冲新星",
      desc: "周期性圆形爆发更强，范围更大。",
      apply: () => {
        state.weapons.pulse.level++;
        state.weapons.pulse.damage += 9;
        state.weapons.pulse.radius += 16;
        state.weapons.pulse.cooldown = Math.max(1.4, state.weapons.pulse.cooldown * 0.9);
      },
    },
    {
      id: "knife",
      icon: "K",
      name: "像素飞刀",
      desc: "向移动方向追加穿透飞刀。",
      apply: () => {
        state.weapons.knife.level++;
        state.weapons.knife.count = Math.min(5, state.weapons.knife.count + 1);
        state.weapons.knife.damage += 4;
      },
    },
    {
      id: "speed",
      icon: "S",
      name: "相位步",
      desc: "移动速度提高，拾取半径略微扩大。",
      apply: () => {
        state.player.speed += 18;
        state.player.magnet += 10;
      },
    },
    {
      id: "guard",
      icon: "G",
      name: "晶盾增幅",
      desc: "最大生命提高并立即恢复生命。",
      apply: () => {
        state.player.maxHp += 18;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 42);
      },
    },
    {
      id: "magnet",
      icon: "M",
      name: "引力核心",
      desc: "经验晶体会从更远处飞向你。",
      apply: () => {
        state.player.magnet += 42;
      },
    },
    {
      id: "crit",
      icon: "C",
      name: "裂解算法",
      desc: "所有武器伤害提高。",
      apply: () => {
        state.player.damageScale += 0.14;
      },
    },
  ];

  function resetGame() {
    enemies.length = 0;
    bullets.length = 0;
    gems.length = 0;
    particles.length = 0;
    state.mode = "playing";
    state.time = 0;
    state.wave = 1;
    state.kills = 0;
    state.shards = 0;
    state.nextSpawn = 0;
    state.spawnBudget = 0;
    state.bossSpawned = false;
    state.victory = false;
    state.shake = 0;
    state.flash = 0;
    state.player = {
      x: 0,
      y: 0,
      r: 14,
      hp: 110,
      maxHp: 110,
      speed: 210,
      level: 1,
      xp: 0,
      xpNeed: 14,
      magnet: 92,
      invuln: 0,
      damageScale: 1,
      dirX: 1,
      dirY: 0,
    };
    state.weapons = {
      bolt: { level: 1, timer: 0, cooldown: 0.62, damage: 18, speed: 560 },
      orbit: { level: 1, angle: 0, count: 2, radius: 54, damage: 13, hitCd: 0.32 },
      pulse: { level: 1, timer: 2.4, cooldown: 3.4, damage: 24, radius: 102 },
      knife: { level: 0, timer: 1.3, cooldown: 1.55, count: 0, damage: 18 },
    };
    ui.startOverlay.classList.remove("active");
    ui.endOverlay.classList.remove("active");
    ui.levelOverlay.classList.remove("active");
    playTone(180, 0.04, "square");
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(320, Math.floor(window.innerWidth));
    height = Math.max(420, Math.floor(window.innerHeight));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function setMode(mode) {
    if (state.mode === "ended") return;
    state.mode = mode;
    ui.pauseButton.textContent = mode === "paused" ? "▶" : "II";
  }

  function endGame(victory) {
    state.mode = "ended";
    state.victory = victory;
    const best = Number(localStorage.getItem(SAVE_KEY) || 0);
    if (state.time > best) localStorage.setItem(SAVE_KEY, String(Math.floor(state.time)));
    ui.endEyebrow.textContent = victory ? "VICTORY" : "RUN COMPLETE";
    ui.endTitle.textContent = victory ? "核心已摧毁" : "生存结束";
    ui.endStats.innerHTML = "";
    [
      `时间 ${formatTime(state.time)}`,
      `等级 ${state.player.level}`,
      `击败 ${state.kills}`,
      `碎片 ${state.shards}`,
    ].forEach((text) => {
      const item = document.createElement("span");
      item.textContent = text;
      ui.endStats.appendChild(item);
    });
    ui.endOverlay.classList.add("active");
    updateBestText();
    playTone(victory ? 520 : 120, 0.12, "sawtooth");
  }

  function update(dt) {
    if (state.mode !== "playing") return;

    state.time += dt;
    state.wave = 1 + Math.floor(state.time / 35);
    state.shake = Math.max(0, state.shake - dt * 20);
    state.flash = Math.max(0, state.flash - dt * 3);

    updatePlayer(dt);
    updateSpawning(dt);
    updateEnemies(dt);
    buildEnemyGrid();
    updateWeapons(dt);
    updateBullets(dt);
    updateGems(dt);
    updateParticles(dt);
    updateProgression();

    state.cameraX += (state.player.x - state.cameraX) * Math.min(1, dt * 8);
    state.cameraY += (state.player.y - state.cameraY) * Math.min(1, dt * 8);

    if (state.player.hp <= 0) {
      endGame(false);
    }
    if (state.time >= 600 && state.bossSpawned && !enemies.some((e) => e.boss)) {
      endGame(true);
    }
  }

  function updatePlayer(dt) {
    const p = state.player;
    let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.vx;
    let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.vy;
    const len = Math.hypot(vx, vy);
    if (len > 0.001) {
      vx /= len;
      vy /= len;
      p.dirX = vx;
      p.dirY = vy;
      p.x += vx * p.speed * dt;
      p.y += vy * p.speed * dt;
    }
    const half = WORLD_SIZE / 2 - 60;
    p.x = clamp(p.x, -half, half);
    p.y = clamp(p.y, -half, half);
    p.invuln = Math.max(0, p.invuln - dt);
  }

  function updateSpawning(dt) {
    const danger = Math.min(1, state.time / 520);
    state.spawnBudget += dt * (3.8 + danger * 12 + state.wave * 0.35);
    if (state.time > 510 && !state.bossSpawned) {
      state.bossSpawned = true;
      spawnEnemy("boss");
      showPulse(state.player.x, state.player.y, 180, "#ff4d6d", 0.5);
    }
    while (state.spawnBudget >= 1 && enemies.length < ENEMY_LIMIT) {
      state.spawnBudget--;
      const roll = Math.random();
      if (state.time > 260 && roll < 0.12) spawnEnemy("tank");
      else if (state.time > 150 && roll < 0.34) spawnEnemy("runner");
      else if (state.time > 90 && roll < 0.48) spawnEnemy("splitter");
      else spawnEnemy("chaser");
    }
  }

  function spawnEnemy(type) {
    const angle = Math.random() * TAU;
    const dist = Math.max(width, height) * 0.66 + 80 + Math.random() * 180;
    const e = pop(enemyPool, {});
    e.type = type;
    e.dead = false;
    e.x = state.player.x + Math.cos(angle) * dist;
    e.y = state.player.y + Math.sin(angle) * dist;
    e.hitTimer = 0;
    e.flash = 0;
    e.boss = false;
    const scale = 1 + state.wave * 0.08;
    if (type === "runner") {
      Object.assign(e, { r: 12, hp: 34 * scale, maxHp: 34 * scale, speed: 118 + state.wave * 2.5, damage: 12, xp: 4, color: "#ffd166" });
    } else if (type === "tank") {
      Object.assign(e, { r: 24, hp: 150 * scale, maxHp: 150 * scale, speed: 48 + state.wave, damage: 24, xp: 15, color: "#b48cff" });
    } else if (type === "splitter") {
      Object.assign(e, { r: 16, hp: 64 * scale, maxHp: 64 * scale, speed: 76 + state.wave * 1.3, damage: 15, xp: 8, color: "#77ff8a" });
    } else if (type === "boss") {
      Object.assign(e, { r: 52, hp: 3200, maxHp: 3200, speed: 34, damage: 34, xp: 180, color: "#ff4d6d", boss: true });
    } else {
      Object.assign(e, { r: 14, hp: 44 * scale, maxHp: 44 * scale, speed: 78 + state.wave * 1.5, damage: 14, xp: 5, color: "#42e8ff" });
    }
    enemies.push(e);
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const wobble = Math.sin(state.time * 2 + e.x * 0.01) * 0.18;
      e.x += (dx / dist + -dy / dist * wobble) * e.speed * dt;
      e.y += (dy / dist + dx / dist * wobble) * e.speed * dt;
      e.hitTimer = Math.max(0, e.hitTimer - dt);
      e.flash = Math.max(0, e.flash - dt * 8);

      if (dist < p.r + e.r && p.invuln <= 0) {
        p.hp -= e.damage;
        p.invuln = 0.55;
        state.shake = 8;
        state.flash = 0.28;
        burst(p.x, p.y, 12, "#ff4d6d", 120);
        playTone(90, 0.04, "sawtooth");
      }
    }
  }

  function buildEnemyGrid() {
    state.grid.clear();
    for (const e of enemies) {
      const key = cellKey(e.x, e.y);
      let bucket = state.grid.get(key);
      if (!bucket) {
        bucket = [];
        state.grid.set(key, bucket);
      }
        if (!e.dead) bucket.push(e);
    }
  }

  function updateWeapons(dt) {
    const p = state.player;
    const w = state.weapons;
    w.bolt.timer -= dt;
    if (w.bolt.timer <= 0) {
      w.bolt.timer += w.bolt.cooldown;
      const target = nearestEnemy(p.x, p.y, 760);
      if (target) {
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        fireBullet(p.x, p.y, a, w.bolt.speed, w.bolt.damage, 1, "#42e8ff", 4, 1.4);
        playTone(360, 0.025, "square");
      }
    }

    w.knife.timer -= dt;
    if (w.knife.level > 0 && w.knife.timer <= 0) {
      w.knife.timer += w.knife.cooldown;
      const base = Math.atan2(p.dirY, p.dirX);
      for (let i = 0; i < w.knife.count; i++) {
        const spread = (i - (w.knife.count - 1) / 2) * 0.18;
        fireBullet(p.x, p.y, base + spread, 680, w.knife.damage, 3, "#f3f7ff", 3, 0.8);
      }
      playTone(520, 0.025, "triangle");
    }

    w.orbit.angle += dt * (2.6 + w.orbit.level * 0.16);
    const orbitHits = [];
    for (let i = 0; i < w.orbit.count; i++) {
      const a = w.orbit.angle + (i / w.orbit.count) * TAU;
      const ox = p.x + Math.cos(a) * w.orbit.radius;
      const oy = p.y + Math.sin(a) * w.orbit.radius;
      queryEnemies(ox, oy, 32, orbitHits);
      for (const e of orbitHits) {
        if (e.hitTimer <= 0 && circleHit(ox, oy, 15, e.x, e.y, e.r)) {
          damageEnemy(e, w.orbit.damage, ox, oy);
          e.hitTimer = w.orbit.hitCd;
        }
      }
      orbitHits.length = 0;
    }

    w.pulse.timer -= dt;
    if (w.pulse.timer <= 0) {
      w.pulse.timer += w.pulse.cooldown;
      const hits = [];
      queryEnemies(p.x, p.y, w.pulse.radius, hits);
      for (const e of hits) damageEnemy(e, w.pulse.damage, e.x, e.y);
      showPulse(p.x, p.y, w.pulse.radius, "#77ff8a", 0.34);
      state.shake = Math.max(state.shake, 3);
      playTone(150, 0.08, "sine");
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const hits = [];
      queryEnemies(b.x, b.y, b.r + 28, hits);
      for (const e of hits) {
        if (b.pierce <= 0) break;
        if (circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) {
          damageEnemy(e, b.damage, b.x, b.y);
          b.pierce--;
        }
      }
      if (b.life <= 0 || b.pierce <= 0 || Math.abs(b.x - state.player.x) > width * 0.9 + 220 || Math.abs(b.y - state.player.y) > height * 0.9 + 220) {
        recycleAt(bullets, i, bulletPool);
      }
    }
  }

  function updateGems(dt) {
    const p = state.player;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < p.magnet) {
        const pull = (1 - dist / p.magnet) * 520 + 120;
        g.x += (dx / dist) * pull * dt;
        g.y += (dy / dist) * pull * dt;
      }
      if (dist < p.r + 12) {
        p.xp += g.value;
        state.shards += g.value;
        recycleAt(gems, i, gemPool);
        playTone(760, 0.02, "sine");
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.t += dt;
      if (p.life <= 0) recycleAt(particles, i, particlePool);
    }
  }

  function updateProgression() {
    const p = state.player;
    if (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level++;
      p.xpNeed = Math.floor(p.xpNeed * 1.22 + 8);
      showLevelChoices();
    }
  }

  function damageEnemy(e, amount, x, y) {
    if (e.dead) return;
    e.hp -= amount * state.player.damageScale;
    e.flash = 1;
    if (Math.random() < 0.55) spark(x, y, e.color);
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const index = enemies.indexOf(e);
    if (index !== -1) enemies.splice(index, 1);
    state.kills++;
    dropGem(e.x, e.y, e.xp);
    burst(e.x, e.y, e.boss ? 42 : 12, e.color, e.boss ? 260 : 120);
    if (e.type === "splitter" && state.mode === "playing") {
      for (let i = 0; i < 2 && enemies.length < ENEMY_LIMIT; i++) {
        const child = pop(enemyPool, {});
        Object.assign(child, {
          type: "chaser",
          dead: false,
          x: e.x + (Math.random() - 0.5) * 40,
          y: e.y + (Math.random() - 0.5) * 40,
          r: 10,
          hp: 22 + state.wave * 2,
          maxHp: 22 + state.wave * 2,
          speed: 108,
          damage: 9,
          xp: 2,
          color: "#77ff8a",
          hitTimer: 0,
          flash: 0,
          boss: false,
        });
        enemies.push(child);
      }
    }
    enemyPool.push(e);
  }

  function fireBullet(x, y, angle, speed, damage, pierce, color, r, life) {
    if (bullets.length >= BULLET_LIMIT) return;
    const b = pop(bulletPool, {});
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.damage = damage;
    b.pierce = pierce;
    b.color = color;
    b.r = r;
    b.life = life;
    bullets.push(b);
  }

  function dropGem(x, y, value) {
    if (gems.length >= GEM_LIMIT) return;
    const g = pop(gemPool, {});
    g.x = x;
    g.y = y;
    g.value = Math.max(1, Math.round(value));
    g.phase = Math.random() * TAU;
    gems.push(g);
  }

  function spark(x, y, color) {
    if (particles.length >= PARTICLE_LIMIT) return;
    const p = pop(particlePool, {});
    p.kind = "spark";
    p.x = x;
    p.y = y;
    const a = Math.random() * TAU;
    const s = 40 + Math.random() * 110;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = 0.24 + Math.random() * 0.18;
    p.maxLife = p.life;
    p.t = 0;
    p.size = 2 + Math.random() * 4;
    p.color = color;
    particles.push(p);
  }

  function burst(x, y, count, color, speed) {
    for (let i = 0; i < count && particles.length < PARTICLE_LIMIT; i++) {
      const p = pop(particlePool, {});
      p.kind = "spark";
      p.x = x;
      p.y = y;
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.9);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0.35 + Math.random() * 0.45;
      p.maxLife = p.life;
      p.t = 0;
      p.size = 2 + Math.random() * 5;
      p.color = color;
      particles.push(p);
    }
  }

  function showPulse(x, y, radius, color, life) {
    if (particles.length >= PARTICLE_LIMIT) return;
    const p = pop(particlePool, {});
    p.kind = "ring";
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.radius = radius;
    p.life = life;
    p.maxLife = life;
    p.t = 0;
    p.size = 2;
    p.color = color;
    particles.push(p);
  }

  function showLevelChoices() {
    state.mode = "leveling";
    ui.choiceList.innerHTML = "";
    const choices = pickChoices();
    for (const def of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-card";
      button.innerHTML = `<i>${def.icon}</i><strong>${def.name}</strong><p>${def.desc}</p>`;
      button.addEventListener("click", () => {
        def.apply();
        ui.levelOverlay.classList.remove("active");
        state.mode = "playing";
        state.flash = 0.18;
        playTone(430, 0.06, "triangle");
      }, { once: true });
      ui.choiceList.appendChild(button);
    }
    ui.levelOverlay.classList.add("active");
  }

  function pickChoices() {
    const available = UPGRADE_DEFS.filter((def) => {
      if (def.id === "orbit") return state.weapons.orbit.count < 8;
      if (def.id === "knife") return state.weapons.knife.count < 5;
      return true;
    });
    const picked = [];
    while (picked.length < 3 && available.length > 0) {
      const index = Math.floor(Math.random() * available.length);
      picked.push(available.splice(index, 1)[0]);
    }
    return picked;
  }

  function render() {
    const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const camX = state.cameraX - width / 2 - sx;
    const camY = state.cameraY - height / 2 - sy;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#060912";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(-camX, -camY);
    drawGrid(camX, camY);
    drawBounds();
    drawGems();
    drawBullets();
    drawEnemies();
    drawOrbitals();
    drawPlayer();
    drawParticles();
    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 77, 109, ${state.flash * 0.18})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function drawGrid(camX, camY) {
    const step = 64;
    const startX = Math.floor(camX / step) * step;
    const startY = Math.floor(camY / step) * step;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(66, 232, 255, 0.07)";
    ctx.beginPath();
    for (let x = startX; x < camX + width + step; x += step) {
      ctx.moveTo(Math.round(x), camY - step);
      ctx.lineTo(Math.round(x), camY + height + step);
    }
    for (let y = startY; y < camY + height + step; y += step) {
      ctx.moveTo(camX - step, Math.round(y));
      ctx.lineTo(camX + width + step, Math.round(y));
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.055)";
    for (let x = startX; x < camX + width + step; x += step * 2) {
      for (let y = startY; y < camY + height + step; y += step * 2) {
        if (((x + y) / step) % 4 === 0) ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
      }
    }
  }

  function drawBounds() {
    const half = WORLD_SIZE / 2;
    ctx.strokeStyle = "rgba(255, 77, 109, 0.45)";
    ctx.lineWidth = 4;
    ctx.strokeRect(-half, -half, WORLD_SIZE, WORLD_SIZE);
  }

  function drawPlayer() {
    if (!state.player) return;
    const p = state.player;
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(Math.atan2(p.dirY, p.dirX));
    ctx.fillStyle = p.invuln > 0 ? "#ffffff" : "#42e8ff";
    ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = "#031018";
    ctx.fillRect(2, -5, 12, 10);
    ctx.strokeStyle = "#f3f7ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!inView(e.x, e.y, e.r + 80)) continue;
      ctx.save();
      ctx.translate(Math.round(e.x), Math.round(e.y));
      const hpRatio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.color;
      if (e.boss) {
        ctx.rotate(state.time * 0.8);
        ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
        ctx.clearRect(-e.r * 0.38, -e.r * 0.38, e.r * 0.76, e.r * 0.76);
      } else if (e.type === "runner") {
        drawDiamond(0, 0, e.r);
      } else if (e.type === "tank") {
        ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
      } else {
        drawHex(0, 0, e.r);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.76)";
      ctx.lineWidth = e.boss ? 3 : 2;
      ctx.strokeRect(-e.r, -e.r - 8, e.r * 2, 3);
      ctx.fillStyle = "#77ff8a";
      ctx.fillRect(-e.r, -e.r - 8, e.r * 2 * hpRatio, 3);
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      if (!inView(b.x, b.y, 40)) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);
    }
  }

  function drawGems() {
    for (const g of gems) {
      if (!inView(g.x, g.y, 40)) continue;
      const bob = Math.sin(state.time * 6 + g.phase) * 2;
      ctx.fillStyle = g.value >= 15 ? "#b48cff" : g.value >= 8 ? "#77ff8a" : "#42e8ff";
      drawDiamond(Math.round(g.x), Math.round(g.y + bob), 6);
    }
  }

  function drawOrbitals() {
    const p = state.player;
    const w = state.weapons.orbit;
    ctx.fillStyle = "#ffd166";
    for (let i = 0; i < w.count; i++) {
      const a = w.angle + (i / w.count) * TAU;
      const x = p.x + Math.cos(a) * w.radius;
      const y = p.y + Math.sin(a) * w.radius;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(a);
      ctx.fillRect(-13, -5, 26, 10);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === "ring") {
        ctx.strokeStyle = hexToRgba(p.color, alpha * 0.72);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 - alpha * 0.2), 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = hexToRgba(p.color, alpha);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
  }

  function updateHud() {
    if (!state.player) return;
    const p = state.player;
    ui.hpBar.style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
    ui.xpBar.style.transform = `scaleX(${clamp(p.xp / p.xpNeed, 0, 1)})`;
    ui.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}`;
    ui.levelText.textContent = `Lv.${p.level}`;
    ui.timerText.textContent = formatTime(state.time);
    ui.waveText.textContent = `第 ${state.wave} 波`;
    ui.killText.textContent = `击败 ${state.kills}`;
    ui.coinText.textContent = `碎片 ${state.shards}`;
    ui.fpsText.textContent = `${Math.round(fps)} fps`;
  }

  function nearestEnemy(x, y, range) {
    let best = null;
    let bestD = range * range;
    for (const e of enemies) {
      const d = distSq(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function queryEnemies(x, y, radius, out) {
    const minX = Math.floor((x - radius) / CELL_SIZE);
    const maxX = Math.floor((x + radius) / CELL_SIZE);
    const minY = Math.floor((y - radius) / CELL_SIZE);
    const maxY = Math.floor((y + radius) / CELL_SIZE);
    const r2 = radius * radius;
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const bucket = state.grid.get(`${gx},${gy}`);
        if (!bucket) continue;
        for (const e of bucket) {
          if (!e.dead && distSq(x, y, e.x, e.y) <= (radius + e.r) * (radius + e.r) + r2 * 0.05) out.push(e);
        }
      }
    }
  }

  function cellKey(x, y) {
    return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
  }

  function circleHit(ax, ay, ar, bx, by, br) {
    return distSq(ax, ay, bx, by) <= (ar + br) * (ar + br);
  }

  function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function inView(x, y, pad) {
    return Math.abs(x - state.cameraX) < width / 2 + pad && Math.abs(y - state.cameraY) < height / 2 + pad;
  }

  function drawDiamond(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawHex(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * TAU;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pop(pool, fallback) {
    return pool.pop() || fallback;
  }

  function recycleAt(list, index, pool) {
    const item = list[index];
    list[index] = list[list.length - 1];
    list.pop();
    pool.push(item);
  }

  function hexToRgba(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function updateBestText() {
    const best = Number(localStorage.getItem(SAVE_KEY) || 0);
    ui.bestText.textContent = `最佳纪录 ${formatTime(best)}`;
  }

  function playTone(freq, duration, type) {
    if (muted) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.035;
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + duration);
    } catch {
      muted = true;
    }
  }

  function bindInput() {
    const keys = new Map([
      ["KeyW", "up"],
      ["ArrowUp", "up"],
      ["KeyS", "down"],
      ["ArrowDown", "down"],
      ["KeyA", "left"],
      ["ArrowLeft", "left"],
      ["KeyD", "right"],
      ["ArrowRight", "right"],
    ]);

    window.addEventListener("keydown", (event) => {
      const action = keys.get(event.code);
      if (action) {
        input[action] = true;
        event.preventDefault();
      }
      if (event.code === "KeyP" || event.code === "Escape") togglePause();
      if (event.code === "Space" && state.mode === "menu") resetGame();
    });
    window.addEventListener("keyup", (event) => {
      const action = keys.get(event.code);
      if (action) {
        input[action] = false;
        event.preventDefault();
      }
    });

    canvas.addEventListener("pointerdown", (event) => {
      if (state.mode === "menu") return;
      input.pointerId = event.pointerId;
      setStick(event);
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId === input.pointerId) setStick(event);
    });
    canvas.addEventListener("pointerup", clearStick);
    canvas.addEventListener("pointercancel", clearStick);

    ui.startButton.addEventListener("click", resetGame);
    ui.restartButton.addEventListener("click", resetGame);
    ui.pauseButton.addEventListener("click", togglePause);
    ui.muteButton.addEventListener("click", () => {
      muted = !muted;
      ui.muteButton.textContent = muted ? "×" : "♪";
    });
  }

  function setStick(event) {
    const max = 42;
    const baseX = 78;
    const baseY = height - 78;
    const dx = event.clientX - baseX;
    const dy = event.clientY - baseY;
    const len = Math.hypot(dx, dy);
    const scale = len > max ? max / len : 1;
    input.vx = clamp(dx / max, -1, 1);
    input.vy = clamp(dy / max, -1, 1);
    ui.touchStick.querySelector("i").style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }

  function clearStick(event) {
    if (event.pointerId !== input.pointerId) return;
    input.pointerId = null;
    input.vx = 0;
    input.vy = 0;
    ui.touchStick.querySelector("i").style.transform = "translate(0, 0)";
  }

  function togglePause() {
    if (state.mode === "playing") setMode("paused");
    else if (state.mode === "paused") setMode("playing");
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
    lastTime = now;
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }
    update(dt);
    render();
    updateHud();
    requestAnimationFrame(loop);
  }

  resize();
  bindInput();
  updateBestText();
  state.player = {
    x: 0,
    y: 0,
    r: 14,
    hp: 110,
    maxHp: 110,
    speed: 210,
    level: 1,
    xp: 0,
    xpNeed: 14,
    magnet: 92,
    invuln: 0,
    damageScale: 1,
    dirX: 1,
    dirY: 0,
  };
  state.weapons = {
    bolt: { level: 1, timer: 0, cooldown: 0.62, damage: 18, speed: 560 },
    orbit: { level: 1, angle: 0, count: 2, radius: 54, damage: 13, hitCd: 0.32 },
    pulse: { level: 1, timer: 2.4, cooldown: 3.4, damage: 24, radius: 102 },
    knife: { level: 0, timer: 1.3, cooldown: 1.55, count: 0, damage: 18 },
  };
  window.addEventListener("resize", resize);
  requestAnimationFrame(loop);
})();
