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
  const CAMERA_ZOOM = 1.28;
  const ENEMY_LIMIT = 420;
  const BULLET_LIMIT = 260;
  const GEM_LIMIT = 320;
  const PARTICLE_LIMIT = 420;
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
    map: null,
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
    state.cameraX = 0;
    state.cameraY = 0;
    state.map = generateMap();
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
      trailTimer: 0,
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

  function generateMap() {
    const palettes = [
      { floor: ["#0d1f2a", "#12313a", "#163b34", "#213646"], accent: ["#42e8ff", "#77ff8a", "#ffd166"] },
      { floor: ["#171728", "#20213a", "#27304a", "#23314a"], accent: ["#b48cff", "#42e8ff", "#ff4d6d"] },
      { floor: ["#1a2020", "#22322b", "#2b3b32", "#3a3b2b"], accent: ["#77ff8a", "#ffd166", "#42e8ff"] },
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const rng = mulberry32(Math.floor(Math.random() * 2147483647));
    const tileSize = 128;
    const half = WORLD_SIZE / 2;
    const tiles = [];
    const props = [];

    for (let y = -half; y < half; y += tileSize) {
      for (let x = -half; x < half; x += tileSize) {
        const n = rng();
        const color = palette.floor[Math.floor(n * palette.floor.length)];
        tiles.push({
          x,
          y,
          color,
          detail: rng(),
          crack: rng() > 0.62,
          glow: rng() > 0.86 ? palette.accent[Math.floor(rng() * palette.accent.length)] : null,
        });
        if (rng() > 0.88) {
          props.push({
            x: x + 20 + rng() * 88,
            y: y + 18 + rng() * 92,
            size: 10 + rng() * 28,
            kind: rng() > 0.5 ? "crystal" : "rubble",
            color: palette.accent[Math.floor(rng() * palette.accent.length)],
            phase: rng() * TAU,
          });
        }
      }
    }

    return { palette, tileSize, tiles, props };
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

    const targetCameraX = clampCameraCenterX(state.player.x);
    const targetCameraY = clampCameraCenterY(state.player.y);
    state.cameraX += (targetCameraX - state.cameraX) * Math.min(1, dt * 8);
    state.cameraY += (targetCameraY - state.cameraY) * Math.min(1, dt * 8);
    state.cameraX = clampCameraCenterX(state.cameraX);
    state.cameraY = clampCameraCenterY(state.cameraY);

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
      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = 0.055;
        dust(p.x - vx * 12, p.y - vy * 12, -vx, -vy);
      }
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
    const spawnX = state.player.x + Math.cos(angle) * dist;
    const spawnY = state.player.y + Math.sin(angle) * dist;
    const e = pop(enemyPool, {});
    e.type = type;
    e.dead = false;
    e.x = spawnX;
    e.y = spawnY;
    e.hitTimer = 0;
    e.flash = 0;
    e.anim = Math.random() * TAU;
    e.flip = Math.cos(angle) > 0 ? -1 : 1;
    e.variant = Math.floor(Math.random() * 4);
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
    const half = WORLD_SIZE / 2;
    e.x = clamp(e.x, -half + e.r, half - e.r);
    e.y = clamp(e.y, -half + e.r, half - e.r);
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
      const half = WORLD_SIZE / 2;
      e.x = clamp(e.x, -half + e.r, half - e.r);
      e.y = clamp(e.y, -half + e.r, half - e.r);
      e.anim += dt * (2.4 + e.speed * 0.035);
      e.flip = dx < 0 ? -1 : 1;
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
      b.prevX = b.x;
      b.prevY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.trailTimer -= dt;
      if (b.trailTimer <= 0) {
        b.trailTimer = b.kind === "knife" ? 0.045 : 0.035;
        bulletTrail(b.x, b.y, b.prevX, b.prevY, b.color, b.kind);
      }
      const hits = [];
      queryEnemies(b.x, b.y, b.r + 28, hits);
      for (const e of hits) {
        if (b.pierce <= 0) break;
        if (circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) {
          bulletImpact(b.x, b.y, b.angle, b.color, b.kind);
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
    if (Math.random() < 0.75) blood(x, y, "#6fdb6f");
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
          anim: Math.random() * TAU,
          flip: Math.random() > 0.5 ? 1 : -1,
          variant: Math.floor(Math.random() * 4),
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
        const half = WORLD_SIZE / 2;
        child.x = clamp(child.x, -half + child.r, half - child.r);
        child.y = clamp(child.y, -half + child.r, half - child.r);
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
    b.prevX = x - Math.cos(angle) * 16;
    b.prevY = y - Math.sin(angle) * 16;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.angle = angle;
    b.damage = damage;
    b.pierce = pierce;
    b.color = color;
    b.r = r;
    b.life = life;
    b.maxLife = life;
    b.trailTimer = 0;
    b.spin = Math.random() * TAU;
    b.kind = pierce > 1 ? "knife" : "bolt";
    muzzleFlash(x, y, angle, color);
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

  function muzzleFlash(x, y, angle, color) {
    showPulse(x, y, 18, color, 0.14);
    for (let i = 0; i < 5 && particles.length < PARTICLE_LIMIT; i++) {
      const p = pop(particlePool, {});
      p.kind = "bulletSpark";
      p.x = x + Math.cos(angle) * 12;
      p.y = y + Math.sin(angle) * 12;
      const a = angle + (Math.random() - 0.5) * 0.9;
      const s = 80 + Math.random() * 170;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0.12 + Math.random() * 0.12;
      p.maxLife = p.life;
      p.t = 0;
      p.size = 2 + Math.random() * 3;
      p.color = color;
      particles.push(p);
    }
  }

  function bulletTrail(x, y, prevX, prevY, color, kind) {
    if (particles.length >= PARTICLE_LIMIT) return;
    const p = pop(particlePool, {});
    p.kind = "bulletTrail";
    p.x = x;
    p.y = y;
    p.prevX = prevX;
    p.prevY = prevY;
    p.vx = 0;
    p.vy = 0;
    p.life = kind === "knife" ? 0.16 : 0.2;
    p.maxLife = p.life;
    p.t = 0;
    p.size = kind === "knife" ? 3 : 5;
    p.color = color;
    particles.push(p);
  }

  function bulletImpact(x, y, angle, color, kind) {
    showPulse(x, y, kind === "knife" ? 18 : 24, color, 0.18);
    for (let i = 0; i < 9 && particles.length < PARTICLE_LIMIT; i++) {
      const p = pop(particlePool, {});
      p.kind = i % 3 === 0 ? "bulletShard" : "bulletSpark";
      p.x = x;
      p.y = y;
      const a = angle + Math.PI + (Math.random() - 0.5) * 2.4;
      const s = 90 + Math.random() * 260;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0.16 + Math.random() * 0.24;
      p.maxLife = p.life;
      p.t = 0;
      p.size = 2 + Math.random() * 5;
      p.color = i % 4 === 0 ? "#ffffff" : color;
      particles.push(p);
    }
  }

  function dust(x, y, vx, vy) {
    if (particles.length >= PARTICLE_LIMIT) return;
    const p = pop(particlePool, {});
    p.kind = "dust";
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y + (Math.random() - 0.5) * 10;
    p.vx = vx * 36 + (Math.random() - 0.5) * 24;
    p.vy = vy * 36 + (Math.random() - 0.5) * 24;
    p.life = 0.45 + Math.random() * 0.24;
    p.maxLife = p.life;
    p.t = 0;
    p.size = 5 + Math.random() * 8;
    p.color = "#8fa2a0";
    particles.push(p);
  }

  function blood(x, y, color) {
    for (let i = 0; i < 3 && particles.length < PARTICLE_LIMIT; i++) {
      const p = pop(particlePool, {});
      p.kind = "blood";
      p.x = x;
      p.y = y;
      const a = Math.random() * TAU;
      const s = 60 + Math.random() * 120;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0.25 + Math.random() * 0.25;
      p.maxLife = p.life;
      p.t = 0;
      p.size = 3 + Math.random() * 5;
      p.color = color;
      particles.push(p);
    }
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
        showPulse(state.player.x, state.player.y, 145, "#ffd166", 0.42);
        burst(state.player.x, state.player.y, 24, "#ffd166", 180);
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
    const viewW = visibleWorldWidth();
    const viewH = visibleWorldHeight();
    const camX = clampViewOriginX(state.cameraX - viewW / 2 - sx / CAMERA_ZOOM);
    const camY = clampViewOriginY(state.cameraY - viewH / 2 - sy / CAMERA_ZOOM);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#060912";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.scale(CAMERA_ZOOM, CAMERA_ZOOM);
    ctx.translate(-camX, -camY);
    drawMap(camX, camY);
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

  function drawMap(camX, camY) {
    const map = state.map;
    if (!map) return;
    const viewW = visibleWorldWidth();
    const viewH = visibleWorldHeight();
    const pad = map.tileSize;
    for (const tile of map.tiles) {
      if (tile.x > camX + viewW + pad || tile.x + map.tileSize < camX - pad || tile.y > camY + viewH + pad || tile.y + map.tileSize < camY - pad) continue;
      ctx.fillStyle = tile.color;
      ctx.fillRect(tile.x, tile.y, map.tileSize, map.tileSize);
      ctx.fillStyle = tile.detail > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(tile.x + 8, tile.y + 8, map.tileSize - 16, map.tileSize - 16);
      if (tile.glow) {
        ctx.strokeStyle = hexToRgba(tile.glow, 0.35);
        ctx.lineWidth = 2;
        ctx.strokeRect(tile.x + 4, tile.y + 4, map.tileSize - 8, map.tileSize - 8);
      }
      if (tile.crack) {
        ctx.strokeStyle = "rgba(3,6,12,0.34)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tile.x + 18, tile.y + 20 + tile.detail * 60);
        ctx.lineTo(tile.x + 46, tile.y + 44);
        ctx.lineTo(tile.x + 82, tile.y + 36 + tile.detail * 46);
        ctx.lineTo(tile.x + 110, tile.y + 88);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "rgba(66, 232, 255, 0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 64;
    const startX = Math.floor(camX / step) * step;
    const startY = Math.floor(camY / step) * step;
    for (let x = startX; x < camX + viewW + step; x += step) {
      ctx.moveTo(Math.round(x), camY - step);
      ctx.lineTo(Math.round(x), camY + viewH + step);
    }
    for (let y = startY; y < camY + viewH + step; y += step) {
      ctx.moveTo(camX - step, Math.round(y));
      ctx.lineTo(camX + viewW + step, Math.round(y));
    }
    ctx.stroke();

    for (const prop of map.props) {
      if (!inView(prop.x, prop.y, prop.size + 80)) continue;
      drawMapProp(prop);
    }
  }

  function drawMapProp(prop) {
    ctx.save();
    ctx.translate(Math.round(prop.x), Math.round(prop.y));
    if (prop.kind === "crystal") {
      const pulse = 0.75 + Math.sin(state.time * 3 + prop.phase) * 0.25;
      ctx.fillStyle = hexToRgba(prop.color, 0.34 * pulse);
      drawDiamond(0, 0, prop.size + 10);
      ctx.fillStyle = prop.color;
      drawDiamond(0, 0, prop.size);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(-2, -prop.size * 0.7, 4, prop.size * 0.9);
    } else {
      ctx.fillStyle = "rgba(3,6,12,0.42)";
      ctx.fillRect(-prop.size * 0.6, -prop.size * 0.35, prop.size * 1.2, prop.size * 0.7);
      ctx.fillStyle = hexToRgba(prop.color, 0.28);
      ctx.fillRect(-prop.size * 0.45, -prop.size * 0.22, prop.size * 0.9, prop.size * 0.44);
    }
    ctx.restore();
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
    const hpRatio = p.hp / p.maxHp;
    const moving = input.up || input.down || input.left || input.right || Math.abs(input.vx) > 0.05 || Math.abs(input.vy) > 0.05;
    const pulse = 1 + Math.sin(state.time * 7) * 0.04;
    const hitPop = 1 + (p.invuln > 0 ? Math.sin(p.invuln * 26) * 0.08 + 0.12 : 0);
    const radius = p.r * pulse * hitPop;
    const flash = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    const facing = Math.atan2(p.dirY, p.dirX);
    const bodyColor = flash ? "#ffffff" : "#42e8ff";
    const outlineColor = flash ? "#ffffff" : "#f3f7ff";
    const coreColor = flash ? "#42e8ff" : "#031018";

    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.68, 30, 14, 0, 0, TAU);
    ctx.fill();

    drawDashedCircle(0, 0, p.magnet, 18, "rgba(90,140,210,0.46)");

    if (hpRatio < 0.35) {
      const alertR = radius + 8 + Math.sin(state.time * 8.4) * 4;
      ctx.strokeStyle = "rgba(255,77,109,0.86)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, alertR, 0, TAU);
      ctx.stroke();
    }

    drawGlowCircle(0, 0, radius * 1.05, moving ? 0.46 : 0.32, "#42e8ff");

    const coreAngle = facing + Math.sin(state.time * 7) * 0.2;
    drawRegularPolygon(0, 0, radius * 1.08, 8, coreAngle * 0.2, bodyColor, true);
    drawRegularPolygon(0, 0, radius * 1.08, 8, coreAngle * 0.2, outlineColor, false, 2);
    drawDiamondOutline(0, 0, radius * 0.5, radius * 0.62, outlineColor, 2);

    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.3, 0, TAU);
    ctx.fill();

    const orbitR = radius + 6;
    const orbitA = state.time * 4.2;
    ctx.fillStyle = outlineColor;
    for (let i = 0; i < 2; i++) {
      const a = orbitA + Math.PI * i;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * orbitR, Math.sin(a) * orbitR * 0.42, 2.8, 0, TAU);
      ctx.fill();
    }

    drawDirectionArrow(facing, radius, outlineColor);
    ctx.restore();
  }

  function drawGlowCircle(x, y, radius, alpha, color) {
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = hexToRgba(color, alpha / (i * 2.2));
      ctx.beginPath();
      ctx.arc(x, y, radius * (1 + i * 0.32), 0, TAU);
      ctx.fill();
    }
  }

  function drawRegularPolygon(x, y, radius, sides, angle, color, fill, width = 1) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = angle + (i / sides) * TAU;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  function drawDiamondOutline(x, y, halfW, halfH, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y - halfH);
    ctx.lineTo(x + halfW, y);
    ctx.lineTo(x, y + halfH);
    ctx.lineTo(x - halfW, y);
    ctx.closePath();
    ctx.stroke();
  }

  function drawDirectionArrow(angle, radius, color) {
    const tipR = radius + 12;
    const baseR = radius - 1;
    const perp = angle + Math.PI / 2;
    const halfWidth = 5;
    const tipX = Math.cos(angle) * tipR;
    const tipY = Math.sin(angle) * tipR;
    const b1X = Math.cos(angle) * baseR + Math.cos(perp) * halfWidth;
    const b1Y = Math.sin(angle) * baseR + Math.sin(perp) * halfWidth;
    const b2X = Math.cos(angle) * baseR - Math.cos(perp) * halfWidth;
    const b2Y = Math.sin(angle) * baseR - Math.sin(perp) * halfWidth;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(b1X, b1Y);
    ctx.lineTo(b2X, b2Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawDashedCircle(x, y, radius, segments, color) {
    if (radius <= 0) return;
    const step = TAU / segments;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = 0; i < segments; i += 2) {
      const a1 = i * step;
      const a2 = a1 + step * 0.55;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius);
      ctx.lineTo(x + Math.cos(a2) * radius, y + Math.sin(a2) * radius);
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!inView(e.x, e.y, e.r + 80)) continue;
      ctx.save();
      ctx.translate(Math.round(e.x), Math.round(e.y));
      if (e.boss) {
        drawBossZombie(e);
      } else {
        drawZombie(e);
      }
      ctx.restore();
    }
  }

  function drawZombie(e) {
    const s = e.r / 14;
    const step = Math.sin(e.anim);
    const lurch = Math.sin(e.anim * 0.5 + e.variant) * 2;
    const flash = e.flash > 0;
    const skin = flash ? "#ffffff" : "#7ccf68";
    const skinDark = flash ? "#e8f7ff" : "#4e8f4e";
    const cloth = e.type === "runner" ? "#d6b64f" : e.type === "tank" ? "#7b66c7" : e.type === "splitter" ? "#61a06a" : "#2b8da4";

    ctx.scale(e.flip || 1, 1);
    ctx.translate(lurch, 0);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.fillRect(-8 * s, 9 * s, 18 * s, 5 * s);

    ctx.fillStyle = skinDark;
    ctx.fillRect(-9 * s, -5 * s + step * 2, 6 * s, 20 * s);
    ctx.fillRect(3 * s, -5 * s - step * 2, 6 * s, 20 * s);

    ctx.fillStyle = cloth;
    ctx.fillRect(-10 * s, -12 * s, 20 * s, 22 * s);
    ctx.fillStyle = "rgba(255,77,109,0.42)";
    ctx.fillRect(2 * s, -9 * s, 6 * s, 8 * s);
    ctx.fillStyle = "rgba(3,6,12,0.34)";
    ctx.fillRect(-8 * s, -5 * s, 16 * s, 4 * s);

    ctx.fillStyle = skin;
    ctx.fillRect(-8 * s, -28 * s, 16 * s, 16 * s);
    ctx.fillStyle = "#203018";
    ctx.fillRect(-4 * s, -23 * s, 3 * s, 3 * s);
    ctx.fillRect(4 * s, -23 * s, 3 * s, 3 * s);
    ctx.fillStyle = "#f3f7ff";
    ctx.fillRect(4 * s, -24 * s, 2 * s, 2 * s);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-2 * s, -16 * s, 7 * s, 2 * s);
    ctx.fillStyle = skinDark;
    ctx.fillRect(-9 * s, -30 * s, 8 * s, 4 * s);

    ctx.fillStyle = skin;
    ctx.fillRect(-18 * s, -10 * s + step * 4, 8 * s, 6 * s);
    ctx.fillRect(10 * s, -10 * s - step * 4, 8 * s, 6 * s);

    if (e.type === "splitter") {
      ctx.fillStyle = "#b6ff99";
      ctx.fillRect(-2 * s, -32 * s, 4 * s, 5 * s);
    }
  }

  function drawBossZombie(e) {
    const pulse = Math.sin(e.anim) * 4;
    ctx.scale(e.flip || 1, 1);
    ctx.translate(Math.sin(e.anim * 0.4) * 3, 0);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(-46, 30, 92, 15);
    ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#6fbf5e";
    ctx.fillRect(-35, -60 + pulse * 0.2, 70, 42);
    ctx.fillStyle = e.flash > 0 ? "#e8f7ff" : "#4b7f44";
    ctx.fillRect(-48, -18, 96, 70);
    ctx.fillStyle = "#5d345e";
    ctx.fillRect(-42, -6, 84, 28);
    ctx.fillStyle = "#171728";
    ctx.fillRect(-22, -46, 10, 10);
    ctx.fillRect(16, -46, 10, 10);
    ctx.fillStyle = "#f3f7ff";
    ctx.fillRect(19, -48, 5, 5);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-12, -30, 28, 5);
    ctx.fillStyle = "rgba(255,77,109,0.45)";
    ctx.fillRect(8, -2, 24, 20);
    ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#6fbf5e";
    ctx.fillRect(-72, -18 + pulse, 34, 12);
    ctx.fillRect(38, -18 - pulse, 34, 12);
    ctx.fillRect(-28, 48 + pulse, 18, 30);
    ctx.fillRect(10, 48 - pulse, 18, 30);
    ctx.strokeStyle = "rgba(255,77,109,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-50, -64, 100, 142);
  }

  function drawBullets() {
    for (const b of bullets) {
      if (!inView(b.x, b.y, 40)) continue;
      const fade = clamp(b.life / b.maxLife, 0, 1);
      const tailX = b.x - Math.cos(b.angle) * (b.kind === "knife" ? 30 : 44);
      const tailY = b.y - Math.sin(b.angle) * (b.kind === "knife" ? 30 : 44);
      const grad = ctx.createLinearGradient(tailX, tailY, b.x, b.y);
      grad.addColorStop(0, hexToRgba(b.color, 0));
      grad.addColorStop(0.55, hexToRgba(b.color, 0.35 * fade));
      grad.addColorStop(1, "#ffffff");
      ctx.strokeStyle = grad;
      ctx.lineWidth = b.kind === "knife" ? 4 : 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineCap = "butt";

      drawGlowCircle(b.x, b.y, b.r + 2, b.kind === "knife" ? 0.28 : 0.42, b.color);
      ctx.save();
      ctx.translate(Math.round(b.x), Math.round(b.y));
      ctx.rotate(b.angle + (b.kind === "knife" ? b.spin + state.time * 18 : 0));
      ctx.fillStyle = "#ffffff";
      if (b.kind === "knife") {
        ctx.fillRect(-b.r * 1.2, -b.r * 0.7, b.r * 2.8, b.r * 1.4);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.r * 1.8, -b.r * 0.35, b.r * 1.2, b.r * 0.7);
      } else {
        ctx.fillRect(-b.r, -b.r, b.r * 2, b.r * 2);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.r * 0.45, -b.r * 0.45, b.r * 0.9, b.r * 0.9);
      }
      ctx.restore();
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
      } else if (p.kind === "bulletTrail") {
        const grad = ctx.createLinearGradient(p.prevX, p.prevY, p.x, p.y);
        grad.addColorStop(0, hexToRgba(p.color, 0));
        grad.addColorStop(1, hexToRgba(p.color, alpha * 0.55));
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size * alpha;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.prevX, p.prevY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.lineCap = "butt";
      } else if (p.kind === "bulletSpark") {
        ctx.fillStyle = hexToRgba(p.color, alpha);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
        ctx.fillRect(Math.round(p.x + p.size), Math.round(p.y), Math.max(1, p.size * 0.5), Math.max(1, p.size * 0.5));
      } else if (p.kind === "bulletShard") {
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(p.t * 18);
        ctx.fillStyle = hexToRgba(p.color, alpha);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.restore();
      } else if (p.kind === "dust") {
        ctx.fillStyle = `rgba(143,162,160,${alpha * 0.28})`;
        ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      } else if (p.kind === "blood") {
        ctx.fillStyle = hexToRgba(p.color, alpha * 0.85);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, Math.max(2, p.size * 0.55));
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
    return Math.abs(x - state.cameraX) < visibleWorldWidth() / 2 + pad && Math.abs(y - state.cameraY) < visibleWorldHeight() / 2 + pad;
  }

  function clampCameraCenterX(x) {
    const half = WORLD_SIZE / 2;
    const min = -half + visibleWorldWidth() / 2;
    const max = half - visibleWorldWidth() / 2;
    return min > max ? 0 : clamp(x, min, max);
  }

  function clampCameraCenterY(y) {
    const half = WORLD_SIZE / 2;
    const min = -half + visibleWorldHeight() / 2;
    const max = half - visibleWorldHeight() / 2;
    return min > max ? 0 : clamp(y, min, max);
  }

  function clampViewOriginX(x) {
    const half = WORLD_SIZE / 2;
    const min = -half;
    const max = half - visibleWorldWidth();
    return min > max ? -visibleWorldWidth() / 2 : clamp(x, min, max);
  }

  function clampViewOriginY(y) {
    const half = WORLD_SIZE / 2;
    const min = -half;
    const max = half - visibleWorldHeight();
    return min > max ? -visibleWorldHeight() / 2 : clamp(y, min, max);
  }

  function visibleWorldWidth() {
    return width / CAMERA_ZOOM;
  }

  function visibleWorldHeight() {
    return height / CAMERA_ZOOM;
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

  function mulberry32(seed) {
    return function nextRandom() {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
  state.map = generateMap();
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
    trailTimer: 0,
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
